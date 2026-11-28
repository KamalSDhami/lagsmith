//! Anti-cheat safety: processes Lagsmith must never open a handle to, read, trim, re-prioritise or close.
//! Kernel anti-cheats (Riot Vanguard, EasyAntiCheat, BattlEye, FACEIT) watch for handles to the games they
//! protect, so we don't even query them. Policy: docs/ANTI-CHEAT.md.

const EXACT: &[&str] = &[
    // Riot Vanguard and VALORANT
    "valorant.exe", "valorant-win64-shipping.exe", "vgc.exe", "vgtray.exe", "vgm.exe",
    // EasyAntiCheat, BattlEye, FACEIT, ESEA, nProtect GameGuard, XIGNCODE, Ricochet
    "easyanticheat.exe", "easyanticheat_eos.exe", "eaanticheat.gameservice.exe",
    "beservice.exe", "beservice_x64.exe", "faceit.exe", "faceitclient.exe", "faceitservice.exe",
    "esea client.exe", "eseaclient.exe", "gamemon.des", "gamemon64.des", "xigncode.exe", "xxd-0.xem", "randgrid.sys",
];
const PREFIXES: &[&str] = &["riotclient", "leagueclient", "league of legends"];

/// True if `exe` (a process image name like "VALORANT.exe") belongs to a game or anti-cheat we must not touch.
pub fn is_protected(exe: &str) -> bool {
    let e = exe.to_ascii_lowercase();
    EXACT.contains(&e.as_str()) || PREFIXES.iter().any(|p| e.starts_with(p)) || e.contains("anticheat")
}

/// True if `exe` means a protected game session is in progress: the game itself or an anti-cheat's in-game
/// component. Tray icons and launchers (vgtray.exe, RiotClient*) run all the time and don't count;
/// they stay on the never-touch list above. Changes are refused while this is true (docs/ANTI-CHEAT.md rule 8).
pub fn is_game_session(exe: &str) -> bool {
    let e = exe.to_ascii_lowercase();
    matches!(e.as_str(),
        "valorant.exe" | "valorant-win64-shipping.exe" | "vgc.exe" | "league of legends.exe"
        | "easyanticheat.exe" | "easyanticheat_eos.exe" | "eaanticheat.gameservice.exe"
        | "beservice.exe" | "beservice_x64.exe" | "faceitservice.exe"
        | "esea client.exe" | "eseaclient.exe" | "xigncode.exe" | "xxd-0.xem"
        | "gamemon.des" | "gamemon64.des")
}

pub const GATE_MESSAGE: &str = "Close VALORANT and other anti-cheat games first. Lagsmith doesn't change anything while they run.";

/// Refuses while a protected game session is running (the game or its in-game anti-cheat), not merely a tray icon.
/// Shared by apply_changes, undo_change, run_admin_task and the elevated helper.
pub fn gate(running: &[String]) -> Result<(), String> {
    if running.iter().any(|n| is_game_session(n)) { Err(GATE_MESSAGE.into()) } else { Ok(()) }
}

/// Process image names from a snapshot. No process is ever opened.
pub fn process_names() -> Result<Vec<String>, String> {
    Ok(processes()?.into_iter().map(|p| p.1).collect())
}

/// (pid, image name) from one snapshot. No process is ever opened.
pub fn processes() -> Result<Vec<(u32, String)>, String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS};
    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(|e| format!("Couldn't list running programs: {e}"))?;
    let mut names: Vec<(u32, String)> = Vec::new();
    let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut more = unsafe { Process32FirstW(snap, &mut entry) }.is_ok();
    while more {
        let end = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
        names.push((entry.th32ProcessID, String::from_utf16_lossy(&entry.szExeFile[..end])));
        more = unsafe { Process32NextW(snap, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snap) };
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::{GATE_MESSAGE, gate, is_game_session, is_protected};

    #[test]
    fn gate_blocks_protected_processes() {
        let names = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(gate(&names(&["explorer.exe", "chrome.exe"])).is_ok());
        assert_eq!(gate(&names(&["explorer.exe", "VALORANT-Win64-Shipping.exe"])), Err(GATE_MESSAGE.to_string()));
        assert!(gate(&names(&["vgtray.exe", "RiotClientServices.exe"])).is_ok()); // tray and launcher don't block
        assert!(gate(&names(&["vgc.exe"])).is_err());
        assert!(gate(&names(&["EasyAntiCheat_EOS.exe"])).is_err());
        assert!(gate(&names(&["EAAntiCheat.GameService.exe"])).is_err());
        assert!(gate(&names(&["xigncode.exe"])).is_err());
    }


    #[test]
    fn game_session_ignores_tray_and_launcher() {
        assert!(is_game_session("VALORANT-Win64-Shipping.exe"));
        assert!(is_game_session("vgc.exe"));
        assert!(!is_game_session("vgtray.exe"));
        assert!(!is_game_session("RiotClientServices.exe"));
        assert!(is_protected("vgtray.exe")); // still never opened
    }

    #[test]
    fn protects_anti_cheat_and_riot() {
        for n in ["VALORANT-Win64-Shipping.exe", "vgc.exe", "RiotClientServices.exe", "EasyAntiCheat_EOS.exe", "BEService.exe", "FACEIT.exe", "SomeGameAntiCheat.exe"] {
            assert!(is_protected(n), "{n} should be protected");
        }
    }

    #[test]
    fn leaves_ordinary_apps_alone() {
        for n in ["chrome.exe", "Discord.exe", "steam.exe", "explorer.exe"] {
            assert!(!is_protected(n), "{n} should not be protected");
        }
    }
}
