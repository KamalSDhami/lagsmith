# Anti-cheat safety policy

Lagsmith is used by people who play games protected by kernel anti-cheat (Riot Vanguard for VALORANT and League of Legends, EasyAntiCheat, BattlEye, FACEIT). Nothing Lagsmith does may look like cheating, interfere with an anti-cheat, or risk a ban. **These rules are hard limits for every feature, now and later.** Any pull request that breaks one is rejected.

## Never

1. **Open a handle to a game or anti-cheat process,** not even query-only. The list is in `src-tauri/src/scan/protected.rs`. Process names from the snapshot list are fine; opening the process is not.
2. **Read or write another process's memory,** inject DLLs, hook functions, or draw overlays inside a game.
3. **Load or ship a kernel driver.** That includes "hardware monitor" drivers such as WinRing0, which Vanguard blocks and flags as vulnerable. For temperatures and fan speeds, use only what Windows exposes without a driver, or leave the feature out.
4. **Change a protected process's priority, CPU affinity, working set ("RAM trim"), or I/O priority,** or suspend or kill it.
5. **Disable, remove, delay or "debloat" anti-cheat services or drivers** (`vgc`, `vgk`, EasyAntiCheat, BEService, FACEIT) or their startup entries. Anti-cheat startup entries never appear as "switch off" suggestions.
6. **Touch game files or anti-cheat folders:** no cleaning, moving or scanning of `C:\Program Files\Riot Vanguard`, `Riot Games`, or any game install or anti-cheat folder.
7. **Toggle security features anti-cheats depend on:** Memory Integrity (HVCI), VBS, Secure Boot, TPM, test signing, or driver signature enforcement. Lagsmith may explain them; it never changes them.
8. **Run while a protected game is open, for any active feature.** Read-only scans may run; anything that changes the system waits until the game is closed. Check by process name only. A "game session" means the game itself, or an anti-cheat's in-game component (`vgc.exe`, EasyAntiCheat, BEService, FACEIT service). Always-on tray icons and launchers (`vgtray.exe`, Riot Client) don't block changes, but they stay on the never-touch list (`scan/protected.rs` `is_game_session`).

## Allowed (these are normal Windows settings, the same ones the Settings app changes)

- Reading event logs, WMI hardware info, disk usage and the startup list.
- Setting the per-app GPU preference for a game in `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`. This is what Settings → Display → Graphics writes.
- Game Mode, Game Bar capture and power mode.
- Cleaning user caches that don't belong to games or anti-cheat.
- Running SFC and DISM, and checking Windows Update for drivers.

## Before adding a feature

Ask: "Could an anti-cheat see this as tampering with a game, or with itself?" If the answer is anything but a clear no, it doesn't ship.
