#![allow(non_snake_case)]

use super::days_from_civil;
use crate::model::*;
use serde::Deserialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use windows::Win32::Foundation::{HLOCAL, LocalFree, SYSTEMTIME};
use windows::Win32::System::Power::{GetSystemPowerStatus, PowerGetActiveScheme, PowerReadFriendlyName, SYSTEM_POWER_STATUS};
use windows::Win32::System::TpmBaseServices::{TBS_SUCCESS, TPM_DEVICE_INFO, TPM_VERSION_12, TPM_VERSION_20, Tbsi_GetDeviceInfo};
use windows::Win32::System::Time::TzSpecificLocalTimeToSystemTime;
use windows::core::GUID;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
use wmi::WMIConnection;

#[derive(Deserialize)]
#[serde(rename = "Win32_PageFileUsage")]
struct PageFileUsage {
    AllocatedBaseSize: Option<u32>, // all three in MB
    CurrentUsage: Option<u32>,
    PeakUsage: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename = "Win32_ComputerSystem")]
struct ComputerSystem {
    AutomaticManagedPagefile: Option<bool>,
    HypervisorPresent: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename = "BatteryStaticData")]
struct BatteryStaticData {
    DesignedCapacity: Option<u32>, // mWh
}

#[derive(Deserialize)]
#[serde(rename = "BatteryFullChargedCapacity")]
struct BatteryFullChargedCapacity {
    FullChargedCapacity: Option<u32>, // mWh
}

pub fn read() -> Result<SystemState, String> {
    let wmi = WMIConnection::new().map_err(|e| format!("Couldn't connect to WMI: {e}"))?;
    let cs: Vec<ComputerSystem> = wmi.query().map_err(|e| format!("Couldn't read system settings from WMI: {e}"))?;
    let cs = cs.first();
    let files: Vec<PageFileUsage> = wmi.query().map_err(|e| format!("Couldn't read the page file from WMI: {e}"))?;
    let mb = |f: fn(&PageFileUsage) -> Option<u32>| files.iter().filter_map(f).map(|v| v as u64 * 1024 * 1024).sum::<u64>();
    let page_file = (!files.is_empty()).then(|| PageFile {
        auto_managed: cs.and_then(|c| c.AutomaticManagedPagefile).unwrap_or(false),
        allocated_bytes: mb(|f| f.AllocatedBaseSize),
        used_bytes: mb(|f| f.CurrentUsage),
        peak_bytes: mb(|f| f.PeakUsage),
    });

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let dword = |path: &str, name: &str| hkcu.open_subkey_with_flags(path, KEY_READ).ok()?.get_value::<u32, _>(name).ok().map(|v| v != 0);

    Ok(SystemState {
        page_file,
        power: power(),
        hyper_v_running: cs.and_then(|c| c.HypervisorPresent).unwrap_or(false),
        wsl_distros: wsl_distros(),
        game_mode: dword(r"Software\Microsoft\GameBar", "AutoGameModeEnabled"),
        game_bar_capture: dword(r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled"),
        last_sfc: last_sfc(),
        secure_boot: secure_boot(),
        tpm_version: tpm_version(),
    })
}

pub(crate) fn wsl_distros() -> Vec<String> {
    let Ok(lxss) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Lxss", KEY_READ) else {
        return Vec::new();
    };
    lxss.enum_keys()
        .flatten()
        .filter_map(|k| lxss.open_subkey_with_flags(k, KEY_READ).ok()?.get_value::<String, _>("DistributionName").ok())
        .collect()
}

fn secure_boot() -> Option<bool> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Control\SecureBoot\State", KEY_READ).ok()?;
    key.get_value::<u32, _>("UEFISecureBootEnabled").ok().map(|v| v == 1)
}

fn tpm_version() -> Option<String> {
    let mut info = TPM_DEVICE_INFO { structVersion: 1, ..Default::default() };
    let rc = unsafe { Tbsi_GetDeviceInfo(size_of::<TPM_DEVICE_INFO>() as u32, (&raw mut info).cast()) };
    match (rc, info.tpmVersion) {
        (TBS_SUCCESS, TPM_VERSION_20) => Some("2.0".into()),
        (TBS_SUCCESS, TPM_VERSION_12) => Some("1.2".into()),
        _ => None,
    }
}

// ---------- Power

windows::core::link!("powrprof.dll" "system" fn PowerGetEffectiveOverlayScheme(effectiveoverlayguid: *mut GUID) -> u32);

pub(crate) const OVERLAY_BEST_PERFORMANCE: GUID = GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238);
pub(crate) const OVERLAY_BEST_EFFICIENCY: GUID = GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a);

pub(crate) fn overlay_mode(g: &GUID) -> &'static str {
    match *g {
        OVERLAY_BEST_PERFORMANCE => "best_performance",
        OVERLAY_BEST_EFFICIENCY => "best_efficiency",
        g if g == GUID::zeroed() => "balanced",
        _ => "unknown",
    }
}

pub(crate) fn current_overlay() -> Option<GUID> {
    let mut g = GUID::zeroed();
    (unsafe { PowerGetEffectiveOverlayScheme(&mut g) } == 0).then_some(g)
}

fn power() -> Power {
    let mut ps = SYSTEM_POWER_STATUS::default();
    let have_status = unsafe { GetSystemPowerStatus(&mut ps) }.is_ok();
    // BatteryFlag 128 = no system battery; 255 = unknown.
    let has_battery = have_status && ps.BatteryFlag != 128 && ps.BatteryFlag != 255;
    let (design, full) = battery_capacity();
    Power {
        plan: plan_name().unwrap_or_default(),
        mode: current_overlay().map_or("unknown", |g| overlay_mode(&g)).into(),
        on_battery: have_status && ps.ACLineStatus == 0,
        battery_percent: (has_battery && ps.BatteryLifePercent <= 100).then_some(ps.BatteryLifePercent),
        battery_design_wh: design,
        battery_full_wh: full,
    }
}

fn plan_name() -> Option<String> {
    let mut scheme: *mut GUID = std::ptr::null_mut();
    if unsafe { PowerGetActiveScheme(None, &mut scheme) }.0 != 0 || scheme.is_null() {
        return None;
    }
    let mut size = 0u32;
    let _ = unsafe { PowerReadFriendlyName(None, Some(scheme), None, None, None, &mut size) };
    let mut buf = vec![0u16; (size as usize).div_ceil(2)];
    let rc = unsafe { PowerReadFriendlyName(None, Some(scheme), None, None, Some(buf.as_mut_ptr().cast()), &mut size) };
    unsafe { LocalFree(Some(HLOCAL(scheme.cast()))) };
    (rc.0 == 0).then(|| super::utf16_to_string(&buf))
}

fn battery_capacity() -> (Option<f32>, Option<f32>) {
    let Ok(wmi) = WMIConnection::with_namespace_path(r"root\wmi") else { return (None, None) };
    let wh = |mwh: Option<u32>| mwh.filter(|&v| v > 0).map(|v| v as f32 / 1000.0);
    // Summed so a second battery (some ThinkPads) counts; a slot with no battery reports no row or 0.
    let design = wmi.query::<BatteryStaticData>().ok().and_then(|r| wh(Some(r.iter().filter_map(|b| b.DesignedCapacity).sum())));
    let full = wmi.query::<BatteryFullChargedCapacity>().ok().and_then(|r| wh(Some(r.iter().filter_map(|b| b.FullChargedCapacity).sum())));
    (design, full)
}

// ---------- Last SFC run, from the CBS log

const CHUNK: u64 = 16 << 20;
// shortcut: reads at most 128 MB from the end of each log and 256 MB in total, and checks up to
// the 4 newest compressed CbsPersist_*.cab archives; an SFC run older than that shows as None.
const MAX_PER_FILE: u64 = 128 << 20;
const MAX_TOTAL: u64 = 256 << 20;
const MAX_CABS: usize = 4;

struct TempDir(PathBuf);
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn cbs_rotations(dir: &std::path::Path, ext: &str) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("CbsPersist_"))
                && p.extension().is_some_and(|x| x.eq_ignore_ascii_case(ext))
        })
        .collect();
    files.sort();
    files.reverse();
    files
}

pub(crate) fn system32_dir() -> Option<PathBuf> {
    let mut buf = [0u16; 260];
    let len = unsafe { windows::Win32::System::SystemInformation::GetSystemDirectoryW(Some(&mut buf)) } as usize;
    if len == 0 || len > buf.len() {
        return None;
    }
    Some(PathBuf::from(super::utf16_to_string(&buf[..len])))
}

fn sfc_in_cab(cab: &PathBuf, idx: usize, budget: &mut u64) -> Option<SfcResult> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let expand = system32_dir()?.join("expand.exe");
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = TempDir(std::env::temp_dir().join(format!("lagsmith-cbs-{}-{seq}-{idx}", std::process::id())));
    std::fs::create_dir(&tmp.0).ok()?;
    let status = Command::new(expand)
        .arg(cab)
        .arg("-F:*")
        .arg(&tmp.0)
        .creation_flags(windows::Win32::System::Threading::CREATE_NO_WINDOW.0)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let mut extracted: Vec<PathBuf> = std::fs::read_dir(&tmp.0)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    extracted.sort();
    extracted.reverse();
    extracted.into_iter().find_map(|p| sfc_in_file(&p, budget))
}

fn last_sfc() -> Option<SfcResult> {
    let dir = super::known_folder(&windows::Win32::UI::Shell::FOLDERID_Windows)?.join(r"Logs\CBS");
    // CBS.log is current; CbsPersist_<timestamp>.log are older plain rotations, newest first.
    let mut budget = MAX_TOTAL;
    if let Some(hit) = std::iter::once(dir.join("CBS.log"))
        .chain(cbs_rotations(&dir, "log"))
        .find_map(|p| sfc_in_file(&p, &mut budget))
    {
        return Some(hit);
    }
    // Windows compresses older rotations into CbsPersist_*.cab; check the newest few if plain logs had none.
    cbs_rotations(&dir, "cab")
        .into_iter()
        .take(MAX_CABS)
        .enumerate()
        .find_map(|(i, cab)| (budget > 0).then(|| sfc_in_cab(&cab, i, &mut budget)).flatten())
}

fn sfc_in_file(path: &PathBuf, budget: &mut u64) -> Option<SfcResult> {
    let mut f = File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let mut start = len;
    let mut tail: Vec<u8> = Vec::new();
    let mut found = false;
    while start > 0 && len - start < MAX_PER_FILE && *budget > 0 {
        let from = start.saturating_sub(CHUNK);
        let mut chunk = vec![0u8; (start - from) as usize];
        f.seek(SeekFrom::Start(from)).ok()?;
        f.read_exact(&mut chunk).ok()?;
        *budget = budget.saturating_sub(chunk.len() as u64);
        // Only the new chunk needs searching (plus 3 bytes in case "[SR]" straddles the join).
        let edge: Vec<u8> = chunk[chunk.len().saturating_sub(3)..].iter().chain(tail.iter().take(3)).copied().collect();
        let hit = has_sr(&chunk) || has_sr(&edge);
        start = from;
        if found {
            chunk.extend_from_slice(&tail);
            tail = chunk;
            break;
        }
        if hit {
            found = true;
            chunk.extend_from_slice(&tail);
            tail = chunk;
            // Read one more chunk so the start of that run is included.
            continue;
        }
        // Nothing here yet: keep just this chunk (for the join check), so the buffer doesn't grow.
        tail = chunk;
    }
    if !found {
        return None;
    }
    let (local, outcome) = sfc_outcome(&String::from_utf8_lossy(&tail))?;
    Some(SfcResult { time: local_to_rfc3339(&local).unwrap_or(local), outcome: outcome.into() })
}

fn has_sr(buf: &[u8]) -> bool {
    buf.windows(4).any(|w| w == b"[SR]")
}

/// Finds the newest SFC run ("[SR]" lines within 3 hours of the last one) and its outcome.
/// Returns the local timestamp "YYYY-MM-DD HH:MM:SS" of its last line.
fn sfc_outcome(text: &str) -> Option<(String, &'static str)> {
    let sr: Vec<&str> = text.lines().filter(|l| l.contains("[SR]")).collect();
    let last = sr.iter().rev().find(|l| cbs_secs(l).is_some())?;
    let end = cbs_secs(last)?;
    let run: Vec<&&str> = sr.iter().filter(|l| cbs_secs(l).is_some_and(|t| t <= end && end - t <= 3 * 3600)).collect();
    let any = |pat: &str| run.iter().any(|l| l.contains(pat));
    let outcome = if any("Cannot repair") || any("could not be repaired") {
        "could_not_repair"
    } else if any("Repairing file") || any("successfully repaired") {
        "repaired"
    } else if any("Verify complete") {
        "no_problems"
    } else {
        "unknown"
    };
    Some((last.get(..19)?.to_string(), outcome))
}

fn cbs_secs(line: &str) -> Option<i64> {
    let n = |r: std::ops::Range<usize>| line.get(r)?.parse::<i64>().ok();
    (line.get(4..5)? == "-" && line.get(10..11)? == " ").then_some(())?;
    Some(days_from_civil(n(0..4)?, n(5..7)? as u32, n(8..10)? as u32) * 86_400 + n(11..13)? * 3600 + n(14..16)? * 60 + n(17..19)?)
}

/// CBS logs local time; the contract wants RFC 3339.
fn local_to_rfc3339(local: &str) -> Option<String> {
    let n = |r: std::ops::Range<usize>| local.get(r)?.parse::<u16>().ok();
    let lt = SYSTEMTIME { wYear: n(0..4)?, wMonth: n(5..7)?, wDay: n(8..10)?, wHour: n(11..13)?, wMinute: n(14..16)?, wSecond: n(17..19)?, ..Default::default() };
    let mut u = SYSTEMTIME::default();
    unsafe { TzSpecificLocalTimeToSystemTime(None, &lt, &mut u) }.ok()?;
    Some(format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", u.wYear, u.wMonth, u.wDay, u.wHour, u.wMinute, u.wSecond))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_guid_mapping() {
        assert_eq!(overlay_mode(&GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238)), "best_performance");
        assert_eq!(overlay_mode(&GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a)), "best_efficiency");
        assert_eq!(overlay_mode(&GUID::zeroed()), "balanced");
        assert_eq!(overlay_mode(&GUID::from_u128(1)), "unknown");
    }

    const L: &str = "2026-11-25 23:17:54, Info                  CSI    000016c8 ";

    #[test]
    fn cbs_sfc_parsing() {
        let repaired = format!(
            "2026-11-25 23:14:47, Info CSI 0000149c [SR] Verifying 100 components\n\
             {L}[SR] Repairing 1 components\n{L}[SR] Repairing file \\??\\C:\\WINDOWS\\System32\\\\OneDriveSetup.exe from store\n\
             {L}[SR] Repair complete\n2026-11-25 23:18:00, Info CBS Something else\n"
        );
        assert_eq!(sfc_outcome(&repaired), Some(("2026-11-25 23:17:54".into(), "repaired")));

        let clean = format!("{L}[SR] Verifying 100 components\n{L}[SR] Verify complete\n{L}[SR] Repairing 0 components\n");
        assert_eq!(sfc_outcome(&clean).map(|r| r.1), Some("no_problems"));

        let broken = format!("{L}[SR] Cannot repair member file [l:10]\"a.dll\"\n{L}[SR] Repairing file x from store\n");
        assert_eq!(sfc_outcome(&broken).map(|r| r.1), Some("could_not_repair"));

        // An older run a day earlier doesn't leak into the newest one.
        let two_runs = format!("2026-11-24 10:00:00, Info CSI 1 [SR] Repairing file y from store\n{clean}");
        assert_eq!(sfc_outcome(&two_runs).map(|r| r.1), Some("no_problems"));

        assert_eq!(sfc_outcome("2026-11-25 10:00:00, Info CBS no sfc here"), None);
    }

    #[test]
    fn cbs_rotation_sorts_newest_first_by_extension() {
        let dir = std::env::temp_dir().join(format!("lagsmith-cbs-sort-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        for name in [
            "CbsPersist_20261124144000.cab",
            "CbsPersist_20261125181620.cab",
            "CbsPersist_20261126115244.log",
            "other.cab",
        ] {
            std::fs::write(dir.join(name), b"").expect("touch");
        }
        let cabs = cbs_rotations(&dir, "cab");
        assert_eq!(cabs.len(), 2);
        assert!(cabs[0].ends_with("CbsPersist_20261125181620.cab"));
        assert!(cabs[1].ends_with("CbsPersist_20261124144000.cab"));
        let logs = cbs_rotations(&dir, "log");
        assert_eq!(logs.len(), 1);
        assert!(logs[0].ends_with("CbsPersist_20261126115244.log"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
