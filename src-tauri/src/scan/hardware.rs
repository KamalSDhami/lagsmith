#![allow(non_snake_case)]

use super::utf16_to_string;
use crate::model::*;
use serde::Deserialize;
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
use windows::Win32::Security::Authentication::Identity::{GetUserNameExW, NameDisplay};
use windows::Win32::System::SystemInformation::GetPhysicallyInstalledSystemMemory;
use windows::core::PWSTR;
use winreg::RegKey;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
use wmi::WMIConnection;

#[derive(Deserialize)]
#[serde(rename = "Win32_ComputerSystem")]
struct ComputerSystem {
    Manufacturer: Option<String>,
    Model: Option<String>,
    SystemFamily: Option<String>,
    SystemSKUNumber: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename = "Win32_Processor")]
struct Processor {
    Name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename = "Win32_PhysicalMemory")]
struct PhysicalMemory {
    Speed: Option<u32>,
    ConfiguredClockSpeed: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename = "Win32_PhysicalMemoryArray")]
struct PhysicalMemoryArray {
    MemoryDevices: Option<u32>,
    Use: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename = "Win32_VideoController")]
struct VideoController {
    Name: Option<String>,
    AdapterCompatibility: Option<String>,
    DriverVersion: Option<String>,
    DriverDate: Option<String>,
    AdapterRAM: Option<u32>,
}

pub fn read() -> Result<Hardware, String> {
    let wmi = WMIConnection::new().map_err(|e| format!("Couldn't connect to WMI: {e}"))?;
    let q = |what: &str, e: wmi::WMIError| format!("Couldn't read {what} from WMI: {e}");

    let cs: Vec<ComputerSystem> = wmi.query().map_err(|e| q("the computer model", e))?;
    let cpu: Vec<Processor> = wmi.query().map_err(|e| q("the processor", e))?;
    let sticks: Vec<PhysicalMemory> = wmi.query().map_err(|e| q("memory modules", e))?;
    let arrays: Vec<PhysicalMemoryArray> = wmi.query().map_err(|e| q("memory slots", e))?;
    let video: Vec<VideoController> = wmi.query().map_err(|e| q("graphics adapters", e))?;

    let mut installed_kb = 0u64;
    let ram_bytes = match unsafe { GetPhysicallyInstalledSystemMemory(&mut installed_kb) } {
        Ok(()) => installed_kb * 1024,
        Err(e) => return Err(format!("Couldn't read installed memory: {e}")),
    };

    Ok(Hardware {
        user_name: user_name(),
        device: cs.first().map(device_name).unwrap_or_default(),
        os: os_name()?,
        cpu: cpu.first().and_then(|p| p.Name.as_deref()).unwrap_or_default().trim().to_string(),
        ram_bytes,
        ram_sticks: sticks.len() as u32,
        // Use 3 = system memory; other arrays are flash or video memory.
        ram_slots: arrays.iter().filter(|a| a.Use.is_none_or(|u| u == 3)).filter_map(|a| a.MemoryDevices).sum(),
        ram_speed_mhz: sticks.iter().filter_map(|s| s.Speed.or(s.ConfiguredClockSpeed)).max().unwrap_or(0),
        gpus: gpus(video),
    })
}

fn user_name() -> String {
    let mut buf = [0u16; 256];
    let mut len = buf.len() as u32;
    let display = unsafe { GetUserNameExW(NameDisplay, Some(PWSTR(buf.as_mut_ptr())), &mut len) }
        .then(|| utf16_to_string(&buf))
        .unwrap_or_default();
    match display.split_whitespace().next() {
        Some(first) => first.to_string(),
        None => std::env::var("USERNAME").unwrap_or_default(),
    }
}

fn device_name(cs: &ComputerSystem) -> String {
    let clean = |s: &Option<String>| s.as_deref().unwrap_or("").trim().to_string();
    let (maker, model, family, sku) = (clean(&cs.Manufacturer), clean(&cs.Model), clean(&cs.SystemFamily), clean(&cs.SystemSKUNumber));
    // Lenovo reports the machine-type code as Model ("20L6S42005") and the product name as SystemFamily.
    let (name, code) = if !family.is_empty() && !model.contains(' ') && !model.contains(&family) {
        (family, model)
    } else {
        (model, sku)
    };
    let mut out = format!("{maker} {name}").trim().to_string();
    if !code.is_empty() && !out.contains(&code) {
        out = format!("{out} ({code})");
    }
    out
}

fn os_name() -> Result<String, String> {
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", KEY_READ)
        .map_err(|e| format!("Couldn't read the Windows version: {e}"))?;
    let s = |n: &str| key.get_value::<String, _>(n).unwrap_or_default();
    let ubr = key.get_value::<u32, _>("UBR").ok();
    Ok(os_string(&s("ProductName"), &s("DisplayVersion"), &s("CurrentBuild"), ubr))
}

fn os_string(product: &str, display_version: &str, build: &str, ubr: Option<u32>) -> String {
    // ProductName still says "Windows 10" on Windows 11.
    let product = match build.parse::<u32>() {
        Ok(b) if b >= 22000 => product.replacen("Windows 10", "Windows 11", 1),
        _ => product.to_string(),
    };
    let build = match ubr {
        Some(u) => format!("{build}.{u}"),
        None => build.to_string(),
    };
    format!("{product} {display_version} (build {build})").replace("  ", " ")
}

fn gpus(video: Vec<VideoController>) -> Vec<Gpu> {
    let dxgi = dxgi_memory();
    video
        .into_iter()
        .filter_map(|v| {
            let name = v.Name.unwrap_or_default().trim().to_string();
            let lower = name.to_lowercase();
            const VIRTUAL: [&str; 9] =
                ["basic render", "remote display", "hyper-v", "parsec", "virtual", "indirect display", "spacedesk", "vmware", "citrix"];
            if name.is_empty() || VIRTUAL.iter().any(|v| lower.contains(v)) {
                return None;
            }
            let compat = v.AdapterCompatibility.unwrap_or_default();
            if lower.contains("basic display adapter") {
                return Some(Gpu { name, vendor: compat, kind: GpuKind::Software, dedicated_bytes: 0, driver_version: String::new(), driver_date: None });
            }
            // WMI AdapterRAM is a u32 and caps at 4 GB, so prefer DXGI when the names match.
            let dedicated_bytes = dxgi.iter().find(|(n, _)| n.eq_ignore_ascii_case(&name)).map_or(v.AdapterRAM.unwrap_or(0) as u64, |(_, b)| *b);
            let (vendor, kind) = classify(&lower, &compat, dedicated_bytes);
            Some(Gpu {
                name,
                vendor,
                kind,
                dedicated_bytes,
                driver_version: v.DriverVersion.unwrap_or_default(),
                driver_date: v.DriverDate.as_deref().and_then(cim_date),
            })
        })
        .collect()
}

fn classify(lower_name: &str, compat: &str, dedicated: u64) -> (String, GpuKind) {
    let c = compat.to_lowercase();
    let has = |s: &str| lower_name.contains(s) || c.contains(s);
    if has("nvidia") {
        ("NVIDIA".into(), GpuKind::Dedicated)
    } else if has("intel") {
        ("Intel".into(), GpuKind::Integrated)
    } else if has("amd") || has("radeon") || has("advanced micro devices") {
        let rx = lower_name.contains("radeon rx") || lower_name.contains("radeon pro");
        ("AMD".into(), if rx { GpuKind::Dedicated } else { GpuKind::Integrated })
    } else {
        // shortcut: unknown vendors are guessed from VRAM size; add vendors here as they show up.
        (compat.to_string(), if dedicated >= 1 << 30 { GpuKind::Dedicated } else { GpuKind::Integrated })
    }
}

/// "20260902000000.000000-000" -> "2026-09-02"
fn cim_date(s: &str) -> Option<String> {
    let d = s.get(..8).filter(|d| d.bytes().all(|b| b.is_ascii_digit()))?;
    Some(format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..8]))
}

/// Adapter description -> dedicated video memory. Enumeration only; no device is created.
fn dxgi_memory() -> Vec<(String, u64)> {
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else { return Vec::new() };
    let mut out = Vec::new();
    let mut i = 0;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(i) } {
        if let Ok(desc) = unsafe { adapter.GetDesc1() } {
            out.push((utf16_to_string(&desc.Description).trim().to_string(), desc.DedicatedVideoMemory as u64));
        }
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_11_name_fix() {
        assert_eq!(os_string("Windows 10 Pro", "26H2", "26300", Some(9974)), "Windows 11 Pro 26H2 (build 26300.9974)");
        assert_eq!(os_string("Windows 10 Pro", "22H2", "19045", Some(1)), "Windows 10 Pro 22H2 (build 19045.1)");
    }

    #[test]
    fn gpu_classification() {
        assert_eq!(classify("intel(r) uhd graphics 620", "Intel Corporation", 0).1, GpuKind::Integrated);
        assert_eq!(classify("nvidia geforce mx150", "NVIDIA", 0).1, GpuKind::Dedicated);
        assert_eq!(classify("amd radeon rx 6600", "Advanced Micro Devices, Inc.", 0).1, GpuKind::Dedicated);
        assert_eq!(classify("amd radeon(tm) graphics", "Advanced Micro Devices, Inc.", 0).1, GpuKind::Integrated);
    }

    #[test]
    fn lenovo_device_name() {
        let cs = ComputerSystem {
            Manufacturer: Some("LENOVO".into()),
            Model: Some("20L6S42005".into()),
            SystemFamily: Some("ThinkPad T480".into()),
            SystemSKUNumber: Some("LENOVO_MT_20L6_BU_Think_FM_ThinkPad T480".into()),
        };
        assert_eq!(device_name(&cs), "LENOVO ThinkPad T480 (20L6S42005)");
    }
}
