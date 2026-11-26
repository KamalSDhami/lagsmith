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

#[cfg(test)]
mod tests {
    use super::is_protected;

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
