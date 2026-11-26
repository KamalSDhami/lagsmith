# Case study: fixing a laggy, crashing ThinkPad for Valorant

**Date:** 25 Nov 2026 (evening) to 26 Nov 2026
**Result:** blue-screen cause identified, 34.5 GB freed on C:, the user reported the game is "super smooth now".
**Why it matters:** every step below became a feature idea for this app. See `TICKETS.md`.

---

## 1. The machine

| Part | Value |
|---|---|
| Model | Lenovo ThinkPad T480 (20L6S42005), BIOS N24ET81W 1.56 |
| OS | Windows 11 Pro 26H2, build 26300.9974 (stable channel, not Insider) |
| CPU | Intel Core i7-8650U (4 cores, 1.9 GHz) |
| Graphics | Intel UHD Graphics 620 (integrated), driver 31.0.101.2145, Feb 2026 |
| RAM | 8 GB DDR4-2400, 1 of 2 slots used (single channel) |
| Disks | C: 158.6 GB, D: 78.8 GB |
| Security | Memory Integrity (HVCI) on, Hyper-V drivers loaded (WSL) |

## 2. Symptoms reported

- Valorant felt more laggy than before.
- The graphics driver "stopped responding" or froze.
- Windows crashed with "Your PC ran into a problem" (blue screens).

## 3. Diagnosis: what the evidence showed

| Check | Finding | Source |
|---|---|---|
| Blue screens | **0xCE** on 25 Nov 21:27 (a driver unloaded with work still pending); **0x50** on 24 Nov 01:26 (page fault in non-paged area) | Event Log 1001, `C:\Windows\Minidump` |
| Unexpected shutdowns | 9 Nov, 16 Nov, 24 Nov | Event Log 41 and 6008 |
| Anti-cheat | `vgm.exe` (Riot Vanguard) crashed 24 Nov 00:40, about 45 minutes before the 0x50 crash | Event Log 1000 |
| Crash dumps | **`vgk.sys` (Vanguard's kernel driver) loaded in both dumps**; `igdkmd64.sys` (Intel) also present, as in every dump | Strings in the minidumps (copied with admin rights) |
| Graphics driver resets | **None in 30 days**, so the "not responding" freezes were system hangs before a crash, not standalone driver failures | Event Log 4101 |
| Disk | C: had 13.6 GB free (about 9%), leaving the page file little room to grow | Disk scan |
| Memory | About 2 GB of RAM free; the integrated GPU borrows system RAM at single-channel bandwidth | WMI |
| System files | SFC found and repaired 1 corrupt file (`OneDriveSetup.exe`, unrelated); DISM RestoreHealth failed with 0x800f0915 (repair source not found) | CBS and DISM logs |
| Driver updates | Windows Update offers no newer graphics driver. It did list 2017 Intel "System" drivers and Lenovo firmware 1.56, which were not real upgrades | Windows Update Agent |

**Conclusion:**
- **Crashes:** Riot Vanguard was the top suspect.
- **Lag:** a nearly full C: drive, low free RAM, and integrated graphics on single-channel memory.

## 4. Actions taken

| # | Action | Outcome |
|---|---|---|
| 1 | User uninstalled Riot Vanguard (to reinstall clean) | Services `vgc` and `vgk` gone |
| 2 | SFC and DISM run as admin (UAC prompt) | SFC repaired 1 file; DISM failed (0x800f0915); component cleanup exited with code 4 (unclear) |
| 3 | Cleared developer caches: Gradle caches, npm cache, uv cache (2.1 GB), Dart analysis server, temp files | **16.6 GB freed**; all refill on their own |
| 4 | Moved WSL Ubuntu disk (`ext4.vhdx`, 18.3 GB) to `D:\WSL\Ubuntu` with `wsl --manage --move` | Verified Ubuntu still boots; **C: up to 46.5 GB free** |
| 5 | Disabled 5 startup apps (OneDrive Setup, Edge auto-launch, Discord, Kapy Notes, Mem Reduct) through the StartupApproved registry switch | Reversible from Task Manager |
| 6 | Turned off Xbox Game Bar background recording, kept Game Mode on | Registry, reversible |
| 7 | Removed Store apps: Get Help, Sound Recorder, Media Player, Phone Link, Xbox Game Bar overlay | Reinstallable from Microsoft Store |
| 8 | Tried to set "Best performance" power mode | Failed through `powercfg`; user to set it manually |

**Before and after:** C: free went from 12.2 GB to 46.7 GB, and D: free from 26.9 GB to 8.6 GB.

**Deliberately skipped:**
- Moving the Android SDK: D: space was needed for game patches.
- `~\.cache` (Hugging Face models, a project cache): user data, slow to re-download.
- Turning off Memory Integrity: a security trade-off, so it was left to the user.
- Uninstalling Visual Studio: left to the user.

## 5. Mistakes made, and what the app must do instead

| Mistake | What the app must do |
|---|---|
| Clearing all of `%TEMP%` also deleted the tool's own working files (copied dumps) | Never clear a whole folder blindly. Skip files in use and app-owned folders. |
| Called build 26300 an "Insider" build from the number alone; it was stable 26H2 | Read `DisplayVersion` and channel info; never infer from a number. |
| Said Vanguard was "half-installed" when the user was uninstalling it | Check for in-progress uninstalls and recent user actions before concluding. |
| The user asked "progress?" four times during a 60-minute DISM run | Long jobs show live percentage, the current stage and an estimate. |
| `powercfg` could not set the power mode | Use the Windows power API (`PowerSetActiveOverlayScheme`). |
| Windows Update offered "upgrades" that were older than, or the same as, the installed versions | Compare versions and dates; never suggest a downgrade. |

## 6. Lessons that shaped the product

1. **Diagnose first.** The real crash cause (an anti-cheat driver) was not what the user suspected (graphics).
2. **Show the evidence.** Every claim above has a source column; the app's UI does the same.
3. **Consent and undo.** Every change was explained first and is reversible.
4. **No snake oil.** RAM "cleaners" like Mem Reduct cause stutter. The app shows memory honestly instead (decided 26 Nov).
5. **Protect user data.** Caches yes; models, downloads and documents never without an explicit tick.
