#![allow(non_snake_case)]

use super::{civil_from_days, days_from_civil};
use crate::model::*;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize};
use windows::Win32::System::SystemInformation::GetSystemTime;
use windows::Win32::System::UpdateAgent::{IUpdateSession, IWindowsDriverUpdate, UpdateSession};
use windows::core::{BSTR, Interface};
use wmi::WMIConnection;

#[derive(Deserialize)]
#[serde(rename = "Win32_PnPSignedDriver")]
struct SignedDriver {
    HardWareID: Option<String>,
    DriverDate: Option<String>,
    DeviceClass: Option<String>,
}

struct ComGuard;
impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

// Once per app run: the search takes 10-60 s and the answer won't change meanwhile.
// Failures aren't cached, so a later call retries.
static CACHE: Mutex<Option<DriverUpdates>> = Mutex::new(None);

pub fn check() -> Result<DriverUpdates, String> {
    // Held for the whole search, so overlapping callers wait and then get the cached result.
    let mut cached = CACHE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(done) = cached.as_ref() {
        return Ok(done.clone());
    }
    let fresh = check_now()?;
    *cached = Some(fresh.clone());
    Ok(fresh)
}

fn check_now() -> Result<DriverUpdates, String> {
    // Own thread so COM's apartment can't clash with whatever a pooled thread was left in.
    // Its CoUninitialize only releases this thread: the process-wide MTA that WMI uses is kept
    // alive by the CoIncrementMTAUsage cookie taken in run() (and by the wmi crate in tests).
    std::thread::spawn(|| {
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if hr.is_err() {
            return Err(format!("Couldn't start COM: {}", windows::core::Error::from(hr)));
        }
        let _com = ComGuard; // dropped last, after every COM object in search()
        search()
    })
    .join()
    .map_err(|_| "The driver update check crashed".to_string())?
}

fn search() -> Result<DriverUpdates, String> {
    let installed = installed_dates()?;
    let wua = |e: windows::core::Error| format!("Windows Update check failed: {e}");
    let mut updates = Vec::new();
    unsafe {
        let session: IUpdateSession = CoCreateInstance(&UpdateSession, None, CLSCTX_INPROC_SERVER).map_err(wua)?;
        let result = session.CreateUpdateSearcher().map_err(wua)?.Search(&BSTR::from("IsInstalled=0 and Type='Driver'")).map_err(wua)?;
        let list = result.Updates().map_err(wua)?;
        for i in 0..list.Count().map_err(wua)? {
            let Ok(driver) = list.get_Item(i).and_then(|u| u.cast::<IWindowsDriverUpdate>()) else { continue };
            let (Ok(hwid), Ok(date)) = (driver.DriverHardwareID(), driver.DriverVerDate()) else { continue };
            let offered = ole_date_ymd(date);
            if !installed_older(&installed, &hwid.to_string(), offered) {
                continue;
            }
            updates.push(DriverUpdate {
                title: driver.Title().map(|t| t.to_string()).unwrap_or_default(),
                driver_class: driver.DriverClass().map(|c| c.to_string()).unwrap_or_default(),
                date: Some(format!("{:04}-{:02}-{:02}", offered / 10000, offered / 100 % 100, offered % 100)),
            });
        }
    }
    Ok(DriverUpdates { checked_at: now_rfc3339(), updates })
}

/// Lowercased hardware ID -> newest installed driver date as yyyymmdd.
fn installed_dates() -> Result<HashMap<String, u32>, String> {
    let wmi = WMIConnection::new().map_err(|e| format!("Couldn't connect to WMI: {e}"))?;
    let rows: Vec<SignedDriver> = wmi.query().map_err(|e| format!("Couldn't list installed drivers: {e}"))?;
    let mut map = HashMap::new();
    for r in rows {
        // Firmware devices all use Windows' generic c_firmware.inf (dated 2006), so its date says
        // nothing about the firmware actually flashed; leaving them out drops firmware offers.
        // shortcut: firmware upgrades are never reported; compare the offered version with the
        // REV_ in the device's hardware ID when firmware updates are wanted.
        if r.DeviceClass.as_deref().is_some_and(|c| c.eq_ignore_ascii_case("firmware")) {
            continue;
        }
        if let (Some(id), Some(date)) = (r.HardWareID, r.DriverDate.as_deref().and_then(cim_date_ymd)) {
            let e = map.entry(id.to_lowercase()).or_insert(date);
            *e = (*e).max(date);
        }
    }
    Ok(map)
}

/// True only when a matching installed driver exists and is older than the offered one.
/// Unmatched updates are dropped: Windows Update offers stale drivers for absent hardware.
fn installed_older(installed: &HashMap<String, u32>, offered_hwid: &str, offered: u32) -> bool {
    let id = offered_hwid.to_lowercase();
    // The offer may name a less specific ID ("PCI\VEN_8086&DEV_9D3A") than the device's own.
    let prefix = format!("{id}&");
    installed
        .iter()
        .filter(|(k, _)| **k == id || k.starts_with(&prefix))
        .map(|(_, d)| *d)
        .max()
        .is_some_and(|newest| offered > newest)
}

/// OLE Automation DATE (days since 1899-12-30) -> yyyymmdd.
fn ole_date_ymd(date: f64) -> u32 {
    // Clamp to the OLE range (year 100 to 9999) so a bogus value can't overflow; NaN becomes 0.
    let date = date.clamp(-657_434.0, 2_958_465.0);
    let (y, m, d) = civil_from_days(date.floor() as i64 + days_from_civil(1899, 12, 30));
    y as u32 * 10000 + m * 100 + d
}

/// CIM datetime "20170717000000.******+***" -> 20170717.
fn cim_date_ymd(s: &str) -> Option<u32> {
    s.get(..8)?.parse().ok()
}

fn now_rfc3339() -> String {
    let t = unsafe { GetSystemTime() };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_conversions() {
        assert_eq!(ole_date_ymd(0.0), 18991230);
        assert_eq!(ole_date_ymd(46_174.5), 20260601);
        assert_eq!(ole_date_ymd(f64::MAX), 99991231);
        assert_eq!(ole_date_ymd(f64::NAN), 18991230);
        assert_eq!(cim_date_ymd("20170717000000.******+***"), Some(20170717));
        assert_eq!(cim_date_ymd("bad"), None);
    }

    #[test]
    fn only_real_upgrades_survive() {
        let installed: HashMap<String, u32> = [
            (r"pci\ven_8086&dev_5917&subsys_225d17aa&rev_07".to_string(), 20260902),
            (r"ufi\res_{abc}".to_string(), 20240101),
        ]
        .into();
        // Older 2017 driver for present hardware: dropped.
        assert!(!installed_older(&installed, r"PCI\VEN_8086&DEV_5917", 20170717));
        // Same date (firmware already installed): dropped.
        assert!(!installed_older(&installed, r"UFI\RES_{ABC}", 20240101));
        // Newer: kept, with prefix and exact matches.
        assert!(installed_older(&installed, r"PCI\VEN_8086&DEV_5917", 20261001));
        assert!(installed_older(&installed, r"UFI\RES_{ABC}", 20250101));
        // No matching hardware: dropped.
        assert!(!installed_older(&installed, r"PCI\VEN_10DE&DEV_1D10", 20261001));
        // Prefix must stop at an ID boundary.
        assert!(!installed_older(&installed, r"PCI\VEN_8086&DEV_59", 20261001));
    }
}
