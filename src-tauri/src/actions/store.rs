//! C9: remove one leftover Store app for the current user (no admin), through
//! Windows.Management.Deployment.PackageManager. Not reversible: the History item has no undo,
//! it records the package family name so the UI can offer "Reinstall from Microsoft Store".
//!
//! The request is never trusted. At apply time the id must (1) pass the deny list, (2) be one of the
//! packages `get_store_apps` returns right now, and (3) resolve to installed packages that are neither
//! frameworks nor system-signed.

use super::{item_with_pfn, skipped};
use crate::model::*;
use crate::scan::{protected, storeapps};

/// Never removable, whatever any list says. Matched case-insensitively anywhere in the package name.
const DENY: &[&str] = &[
    "xbox", "gaming", "game", "solitaire", "store", "framework", "vclibs", "netnative", "runtime", "windowsappruntime",
    "anticheat", "anti-cheat", "riot", "vanguard", "valorant", "battleye", "beservice", "faceit",
];

/// One installed package, as PackageManager reports it.
#[derive(Clone, Debug)]
pub(crate) struct Pkg {
    pub name: String,
    pub family: String,
    pub full: String,
    pub framework: bool,
    pub system: bool,
}

pub(crate) fn denied(id: &str) -> bool {
    let l = id.to_ascii_lowercase();
    id.is_empty() || DENY.iter().any(|d| l.contains(d)) || protected::is_protected(id)
}

/// The id must be one `get_store_apps` returns right now (itself limited to the allow-list).
pub(crate) fn check_id<'a>(id: &str, installed: &'a [StoreApp]) -> Result<&'a StoreApp, String> {
    if denied(id) {
        return Err("Lagsmith never removes system, Store, Xbox, gaming or anti-cheat apps".into());
    }
    installed.iter().find(|a| a.id == id).ok_or_else(|| "That app isn't in the removable list, or is already gone".to_string())
}

/// All installed packages for `id` (one per architecture), as (family name, full names).
pub(crate) fn pick(id: &str, pkgs: &[Pkg]) -> Result<(String, Vec<String>), String> {
    let mine: Vec<&Pkg> = pkgs.iter().filter(|p| p.name == id).collect();
    let first = mine.first().ok_or("Windows doesn't list that app for this user any more")?;
    if mine.iter().any(|p| p.framework || p.system) {
        return Err("Windows treats this package as part of the system, so Lagsmith won't remove it".into());
    }
    if mine.iter().any(|p| p.family != first.family) {
        return Err("That package name matched more than one app family; nothing was removed".into());
    }
    Ok((first.family.clone(), mine.iter().map(|p| p.full.clone()).collect()))
}

/// Core, with the registry read, the package list and the removal passed in so tests can fake them.
pub(crate) fn remove_with(
    id: &str,
    installed: &[StoreApp],
    list: impl FnOnce() -> Result<Vec<Pkg>, String>,
    mut remove: impl FnMut(&str) -> Result<(), String>,
) -> ChangeItem {
    let fail = |what: &str, e: String| item_with_pfn(format!("Remove {what}"), Err(e), None);
    let app = match check_id(id, installed) {
        Ok(a) => a,
        Err(e) => return fail("a Store app", e),
    };
    let pkgs = match list() {
        Ok(p) => p,
        Err(e) => return fail(&app.name, e),
    };
    let (family, fulls) = match pick(id, &pkgs) {
        Ok(x) => x,
        Err(e) => return fail(&app.name, e),
    };
    let description = format!("Removed {}", app.name);
    for full in &fulls {
        if let Err(e) = remove(full) {
            return item_with_pfn(description, Err(e), None);
        }
    }
    let mut it = item_with_pfn(description, Ok(None), Some(family));
    it.detail = "Can't be undone. You can reinstall it from the Microsoft Store.".into();
    it
}

pub(crate) fn remove(id: &str) -> ChangeItem {
    let installed = match storeapps::read() {
        Ok(a) => a,
        Err(e) => return skipped("Remove a Store app".into(), &e),
    };
    remove_with(id, &installed, os::list_packages, os::remove_package)
}

mod os {
    use super::Pkg;
    use windows::Management::Deployment::{PackageManager, RemovalOptions};
    use windows::core::HSTRING;

    /// Packages installed for the current user (an empty user SID means "me"; no admin needed).
    pub fn list_packages() -> Result<Vec<Pkg>, String> {
        let pm = PackageManager::new().map_err(|e| format!("Couldn't reach Windows' app installer: {e}"))?;
        let found = pm.FindPackagesByUserSecurityId(&HSTRING::new()).map_err(|e| format!("Couldn't list installed apps: {e}"))?;
        let mut out = Vec::new();
        for p in found {
            let (Ok(idn), Ok(framework), Ok(kind)) = (p.Id(), p.IsFramework(), p.SignatureKind()) else { continue };
            let (Ok(name), Ok(family), Ok(full)) = (idn.Name(), idn.FamilyName(), idn.FullName()) else { continue };
            out.push(Pkg {
                name: name.to_string(),
                family: family.to_string(),
                full: full.to_string(),
                framework,
                system: kind == windows::ApplicationModel::PackageSignatureKind::System,
            });
        }
        Ok(out)
    }

    /// Removes for the current user only. Blocks until Windows finishes.
    pub fn remove_package(full: &str) -> Result<(), String> {
        let pm = PackageManager::new().map_err(|e| format!("Couldn't reach Windows' app installer: {e}"))?;
        let op = pm.RemovePackageWithOptionsAsync(&HSTRING::from(full), RemovalOptions::None).map_err(|e| e.message())?;
        let result = op.join().map_err(|e| e.message())?;
        if result.ExtendedErrorCode().map(|c| c.is_err()).unwrap_or(false) {
            let text = result.ErrorText().map(|t| t.to_string()).unwrap_or_default();
            return Err(if text.trim().is_empty() { "Windows couldn't remove the app".into() } else { text.trim().to_string() });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn app(id: &str) -> StoreApp {
        StoreApp { id: id.into(), name: id.into(), publisher: "Microsoft Corporation".into() }
    }
    fn pkg(name: &str, framework: bool, system: bool) -> Pkg {
        Pkg { name: name.into(), family: format!("{name}_8wekyb3d8bbwe"), full: format!("{name}_1.0.0.0_x64__8wekyb3d8bbwe"), framework, system }
    }

    #[test]
    fn deny_list_blocks_system_xbox_and_anti_cheat() {
        for bad in [
            "Microsoft.WindowsStore", "Microsoft.XboxGamingOverlay", "Microsoft.GamingServices", "Microsoft.XboxIdentityProvider", "Microsoft.MicrosoftSolitaireCollection",
            "Microsoft.VCLibs.140.00", "Microsoft.NET.Native.Framework.2.2", "Microsoft.WindowsAppRuntime.1.5",
            "RiotGames.Valorant", "EasyAntiCheat", "BattlEye", "", "Microsoft.StorePurchaseApp",
        ] {
            assert!(denied(bad), "{bad}");
        }
        for ok in storeapps::ALLOWED.iter().map(|a| a.0) {
            assert!(!denied(ok), "{ok} is on the allow-list so must not be denied");
        }
    }

    #[test]
    fn only_listed_ids_pass() {
        let installed = [app("Microsoft.BingNews"), app("Clipchamp.Clipchamp")];
        assert!(check_id("Microsoft.BingNews", &installed).is_ok());
        assert!(check_id("Microsoft.WindowsCalculator", &installed).is_err(), "not on the list");
        assert!(check_id("microsoft.bingnews", &installed).is_err(), "exact match only");
        assert!(check_id(r"Microsoft.BingNews_1.0_x64__8wekyb3d8bbwe", &installed).is_err(), "full name is not an id");
        assert!(check_id("Microsoft.XboxGamingOverlay", &[app("Microsoft.XboxGamingOverlay")]).is_err(), "denied even if listed");
    }

    #[test]
    fn pick_refuses_frameworks_system_and_mixed_families() {
        let (family, fulls) = pick("Microsoft.BingNews", &[pkg("Microsoft.BingNews", false, false), pkg("Other", false, false)]).unwrap();
        assert_eq!(family, "Microsoft.BingNews_8wekyb3d8bbwe");
        assert_eq!(fulls.len(), 1);
        assert!(pick("Microsoft.BingNews", &[pkg("Microsoft.BingNews", true, false)]).is_err());
        assert!(pick("Microsoft.BingNews", &[pkg("Microsoft.BingNews", false, true)]).is_err());
        assert!(pick("Microsoft.BingNews", &[pkg("Other", false, false)]).is_err());
        let mut other = pkg("Microsoft.BingNews", false, false);
        other.family = "Evil_abcdefghjkmnp".into();
        assert!(pick("Microsoft.BingNews", &[pkg("Microsoft.BingNews", false, false), other]).is_err());
    }

    #[test]
    fn removal_records_family_and_no_undo() {
        let installed = [app("Microsoft.BingNews")];
        let removed = RefCell::new(Vec::new());
        let it = remove_with("Microsoft.BingNews", &installed, || Ok(vec![pkg("Microsoft.BingNews", false, false)]), |f| {
            removed.borrow_mut().push(f.to_string());
            Ok(())
        });
        assert_eq!(it.status, "done");
        assert!(it.undo.is_none());
        assert_eq!(it.reinstall_pfn.as_deref(), Some("Microsoft.BingNews_8wekyb3d8bbwe"));
        assert_eq!(removed.borrow().len(), 1);
        assert!(it.detail.contains("Can't be undone"));
    }

    #[test]
    fn refused_requests_never_reach_the_remover() {
        let called = RefCell::new(0);
        let installed = [app("Microsoft.BingNews")];
        let run = |id: &str, pkgs: Vec<Pkg>| {
            remove_with(id, &installed, || Ok(pkgs), |_| {
                *called.borrow_mut() += 1;
                Ok(())
            })
        };
        assert_eq!(run("Microsoft.WindowsStore", vec![pkg("Microsoft.WindowsStore", false, false)]).status, "failed");
        assert_eq!(run("Microsoft.BingNews", vec![pkg("Microsoft.BingNews", false, true)]).status, "failed");
        assert_eq!(run("Microsoft.BingNews", vec![]).status, "failed");
        assert_eq!(*called.borrow(), 0);
    }

    #[test]
    fn failed_removal_is_reported_without_pfn() {
        let installed = [app("Microsoft.BingNews")];
        let it = remove_with("Microsoft.BingNews", &installed, || Ok(vec![pkg("Microsoft.BingNews", false, false)]), |_| Err("0x80073CFA".into()));
        assert_eq!(it.status, "failed");
        assert_eq!(it.detail, "0x80073CFA");
        assert!(it.reinstall_pfn.is_none());
    }
}
