//! Anti-cheat presence. Service Control Manager with query-only rights plus Uninstall keys;
//! never opens their processes, never starts, stops or reconfigures anything (docs/ANTI-CHEAT.md).

use super::wide;
use crate::model::*;
use windows::Win32::System::Services::{
    CloseServiceHandle, OpenSCManagerW, OpenServiceW, QUERY_SERVICE_CONFIGW, QueryServiceConfigW, QueryServiceStatus,
    SC_HANDLE, SC_MANAGER_CONNECT, SERVICE_QUERY_CONFIG, SERVICE_QUERY_STATUS, SERVICE_RUNNING, SERVICE_STATUS,
};
use windows::core::PCWSTR;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};

// (name, services, Uninstall display names that mean "installed")
const KNOWN: [(&str, &[&str], &[&str]); 4] = [
    ("Riot Vanguard", &["vgk", "vgc"], &["Riot Vanguard", "VALORANT"]),
    ("EasyAntiCheat", &["EasyAntiCheat", "EasyAntiCheat_EOS"], &[]),
    ("BattlEye", &["BEService"], &[]),
    ("FACEIT", &["FACEIT"], &[]),
];

pub fn read() -> Result<Vec<AntiCheat>, String> {
    let scm = unsafe { OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT) }
        .map_err(|e| format!("Couldn't open the service list: {e}"))?;
    let programs = uninstall_names();
    let mut out = Vec::new();
    for (name, services, display_names) in KNOWN {
        let listed = programs.iter().any(|p| display_names.iter().any(|d| p.eq_ignore_ascii_case(d)));
        let found: Vec<_> = services.iter().map(|s| (*s, query(scm, s))).collect();
        let any_service = found.iter().any(|(_, q)| q.is_some());
        if !listed && !any_service {
            continue;
        }
        for (service, q) in found {
            let (state, start_type) = q.unwrap_or(("missing", "unknown"));
            out.push(AntiCheat { name: name.into(), installed: listed || any_service, service: service.into(), state: state.into(), start_type: start_type.into() });
        }
    }
    let _ = unsafe { CloseServiceHandle(scm) };
    Ok(out)
}

fn query(scm: SC_HANDLE, service: &str) -> Option<(&'static str, &'static str)> {
    let name = wide(service);
    // Query rights only: no start, stop, pause or change-config access is ever requested.
    let h = unsafe { OpenServiceW(scm, PCWSTR(name.as_ptr()), SERVICE_QUERY_STATUS | SERVICE_QUERY_CONFIG) }.ok()?;
    let mut status = SERVICE_STATUS::default();
    let state = match unsafe { QueryServiceStatus(h, &mut status) } {
        Ok(()) if status.dwCurrentState == SERVICE_RUNNING => "running",
        _ => "stopped",
    };
    // QUERY_SERVICE_CONFIGW is followed by its strings, so ask for the size first.
    let mut needed = 0u32;
    let _ = unsafe { QueryServiceConfigW(h, None, 0, &mut needed) };
    let mut buf = vec![0u64; (needed as usize).div_ceil(8).max(1)];
    let cfg = buf.as_mut_ptr().cast::<QUERY_SERVICE_CONFIGW>();
    let start = match unsafe { QueryServiceConfigW(h, Some(cfg), (buf.len() * 8) as u32, &mut needed) } {
        Ok(()) => start_type(unsafe { (*cfg).dwStartType.0 }),
        Err(_) => "unknown",
    };
    let _ = unsafe { CloseServiceHandle(h) };
    Some((state, start))
}

fn start_type(t: u32) -> &'static str {
    match t {
        0 => "boot",
        1 => "system",
        2 => "auto",
        3 => "manual",
        4 => "disabled",
        _ => "unknown",
    }
}

/// DisplayName of every Uninstall entry (HKLM both views, HKCU).
pub(crate) fn uninstall_names() -> Vec<String> {
    uninstall_keys().into_iter().filter_map(|k| k.get_value::<String, _>("DisplayName").ok()).collect()
}

pub(crate) fn uninstall_keys() -> Vec<RegKey> {
    const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    let roots = [
        (RegKey::predef(HKEY_LOCAL_MACHINE), KEY_READ | KEY_WOW64_64KEY),
        (RegKey::predef(HKEY_LOCAL_MACHINE), KEY_READ | KEY_WOW64_32KEY),
        (RegKey::predef(HKEY_CURRENT_USER), KEY_READ),
    ];
    let mut out = Vec::new();
    for (root, flags) in roots {
        let Ok(parent) = root.open_subkey_with_flags(UNINSTALL, flags) else { continue };
        for sub in parent.enum_keys().flatten() {
            if let Ok(k) = parent.open_subkey_with_flags(&sub, flags) {
                out.push(k);
            }
        }
    }
    out
}
