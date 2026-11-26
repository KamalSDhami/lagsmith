#![allow(non_snake_case)]

use crate::model::*;
use serde::Deserialize;
use std::io::ErrorKind;
use winreg::RegKey;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
use wmi::WMIConnection;

const HVCI: &str = r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity";
// Win32_DeviceGuard.SecurityServicesRunning: 2 = Hypervisor-enforced Code Integrity (Memory Integrity).
const HVCI_SERVICE: u32 = 2;

#[derive(Deserialize)]
#[serde(rename = "Win32_DeviceGuard")]
struct DeviceGuard {
    SecurityServicesRunning: Option<Vec<u32>>,
}

pub fn read() -> Result<Security, String> {
    // What is actually running beats the registry, which only says what's configured for next boot.
    let memory_integrity = match running() {
        Some(on) => on,
        None => configured()?,
    };
    Ok(Security { memory_integrity })
}

fn running() -> Option<bool> {
    let wmi = WMIConnection::with_namespace_path(r"root\Microsoft\Windows\DeviceGuard").ok()?;
    let rows: Vec<DeviceGuard> = wmi.query().ok()?;
    let dg = rows.first()?;
    Some(dg.SecurityServicesRunning.as_deref().unwrap_or_default().contains(&HVCI_SERVICE))
}

fn configured() -> Result<bool, String> {
    match RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(HVCI, KEY_READ) {
        Ok(key) => Ok(key.get_value::<u32, _>("Enabled").unwrap_or(0) == 1),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("Couldn't read the Memory Integrity setting: {e}")),
    }
}
