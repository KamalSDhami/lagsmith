//! Installed Store apps from a fixed allow-list of removable consumer apps. Read from the current
//! user's AppModel repository in the registry (no WinRT needed). Nothing outside the list is ever
//! returned: not Xbox Identity Provider, Store, Edge, Photos, Calculator or Terminal.

use crate::model::*;
use std::collections::BTreeMap;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};

const REPOSITORY: &str = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";

// (exact package name, friendly name, publisher)
pub(crate) const ALLOWED: [(&str, &str, &str); 24] = [
    ("Clipchamp.Clipchamp", "Clipchamp", "Microsoft Corporation"),
    ("Microsoft.BingNews", "Microsoft News", "Microsoft Corporation"),
    ("Microsoft.BingWeather", "Weather", "Microsoft Corporation"),
    ("Microsoft.GetHelp", "Get Help", "Microsoft Corporation"),
    ("Microsoft.Getstarted", "Tips", "Microsoft Corporation"),
    ("Microsoft.MicrosoftSolitaireCollection", "Solitaire Collection", "Microsoft Corporation"),
    ("Microsoft.People", "People", "Microsoft Corporation"),
    ("Microsoft.PowerAutomateDesktop", "Power Automate", "Microsoft Corporation"),
    ("Microsoft.Todos", "Microsoft To Do", "Microsoft Corporation"),
    ("Microsoft.WindowsFeedbackHub", "Feedback Hub", "Microsoft Corporation"),
    ("Microsoft.WindowsMaps", "Maps", "Microsoft Corporation"),
    ("Microsoft.ZuneMusic", "Media Player", "Microsoft Corporation"),
    ("Microsoft.ZuneVideo", "Movies & TV", "Microsoft Corporation"),
    ("Microsoft.YourPhone", "Phone Link", "Microsoft Corporation"),
    ("Microsoft.OutlookForWindows", "Outlook (new)", "Microsoft Corporation"),
    ("Microsoft.MicrosoftOfficeHub", "Microsoft 365 (Office)", "Microsoft Corporation"),
    ("Microsoft.XboxGamingOverlay", "Game Bar", "Microsoft Corporation"),
    ("Microsoft.WindowsSoundRecorder", "Sound Recorder", "Microsoft Corporation"),
    ("Microsoft.WindowsAlarms", "Clock", "Microsoft Corporation"),
    ("MicrosoftCorporationII.QuickAssist", "Quick Assist", "Microsoft Corporation"),
    ("Microsoft.Windows.DevHome", "Dev Home", "Microsoft Corporation"),
    ("Microsoft.549981C3F5F10", "Cortana", "Microsoft Corporation"),
    ("MSTeams", "Microsoft Teams", "Microsoft Corporation"),
    ("7EE7776C.LinkedInforWindows", "LinkedIn", "LinkedIn"),
];

pub fn read() -> Result<Vec<StoreApp>, String> {
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(REPOSITORY, KEY_READ) {
        Ok(k) => k,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Couldn't read the installed Store apps: {e}")),
    };
    Ok(filter(key.enum_keys().flatten()))
}

/// Package full names ("Microsoft.BingNews_4.1.2.0_x64__8wekyb3d8bbwe") -> allow-listed apps, one per name.
fn filter(full_names: impl Iterator<Item = String>) -> Vec<StoreApp> {
    let mut found = BTreeMap::new();
    for full in full_names {
        let name = full.split('_').next().unwrap_or("");
        if let Some(&(id, friendly, publisher)) = ALLOWED.iter().find(|(id, ..)| *id == name) {
            found.insert(id, StoreApp { id: id.into(), name: friendly.into(), publisher: publisher.into() });
        }
    }
    found.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::filter;

    #[test]
    fn only_allow_listed_store_apps() {
        let installed = [
            "Microsoft.BingNews_4.1.2.0_x64__8wekyb3d8bbwe",
            "Microsoft.BingNews_4.1.2.0_neutral_~_8wekyb3d8bbwe",
            "Microsoft.XboxIdentityProvider_12.130.16001.0_x64__8wekyb3d8bbwe",
            "Microsoft.WindowsStore_22410.1401.4.0_x64__8wekyb3d8bbwe",
            "Microsoft.Windows.PeopleExperienceHost_10.0.26100.1_neutral_neutral_cw5n1h2txyewy",
            "Microsoft.WindowsCalculator_11.2410.0.0_x64__8wekyb3d8bbwe",
            "MSTeams_25000.1.0.0_x64__8wekyb3d8bbwe",
        ];
        let ids: Vec<String> = filter(installed.iter().map(|s| s.to_string())).into_iter().map(|a| a.id).collect();
        assert_eq!(ids, ["MSTeams", "Microsoft.BingNews"]);
    }
}
