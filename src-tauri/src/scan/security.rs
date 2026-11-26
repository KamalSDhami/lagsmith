use crate::model::*;
use std::io::ErrorKind;
use winreg::RegKey;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};

const HVCI: &str = r"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity";

pub fn read() -> Result<Security, String> {
    let memory_integrity = match RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(HVCI, KEY_READ) {
        Ok(key) => key.get_value::<u32, _>("Enabled").unwrap_or(0) == 1,
        Err(e) if e.kind() == ErrorKind::NotFound => false,
        Err(e) => return Err(format!("Couldn't read the Memory Integrity setting: {e}")),
    };
    Ok(Security { memory_integrity })
}
