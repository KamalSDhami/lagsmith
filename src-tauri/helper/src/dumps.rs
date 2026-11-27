//! Kernel minidump analyzer using dbgeng.dll loaded strictly from System32 with an empty symbol path.

use crate::model::{AdminEvent, AdminResult, DumpAnalysis};
use crate::protocol::EXIT_SYSTEM_DLL;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use windows::Win32::Foundation::{FreeLibrary, HMODULE};
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize};
use windows::Win32::System::Diagnostics::Debug::Extensions::{
    DEBUG_END_PASSIVE, DEBUG_MODULE_PARAMETERS, DEBUG_WAIT_DEFAULT, IDebugClient, IDebugClient4, IDebugControl, IDebugSymbols,
};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW};
use windows::Win32::System::SystemInformation::GetSystemWindowsDirectoryW;
use windows::Win32::System::Threading::INFINITE;
use windows::core::{GUID, HRESULT, Interface, PCWSTR, s, w};

type DebugCreateFn = unsafe extern "system" fn(*const GUID, *mut *mut core::ffi::c_void) -> HRESULT;

struct ComGuard(bool);
impl ComGuard {
    fn init() -> Self {
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        Self(hr.is_ok())
    }
}
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

struct Library(HMODULE);
impl Drop for Library {
    fn drop(&mut self) {
        let _ = unsafe { FreeLibrary(self.0) };
    }
}

struct DebugSession(IDebugClient);
impl Drop for DebugSession {
    fn drop(&mut self) {
        let _ = unsafe { self.0.EndSession(DEBUG_END_PASSIVE) };
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ModuleInfo {
    pub base: u64,
    pub size: u32,
    pub image_name: String,
    pub module_name: String,
    pub loaded: bool,
}

pub fn run(on_progress: impl Fn(AdminEvent)) -> AdminResult {
    // Initialize COM before loading dbgeng.dll so Drop order releases COM objects -> FreeLibrary -> CoUninitialize.
    let _com = ComGuard::init();
    let lib = match unsafe { LoadLibraryExW(w!("dbgeng.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) } {
        Ok(h) => Library(h),
        Err(_) => std::process::exit(EXIT_SYSTEM_DLL as i32),
    };
    let Some(proc_addr) = (unsafe { GetProcAddress(lib.0, s!("DebugCreate")) }) else {
        drop(lib);
        std::process::exit(EXIT_SYSTEM_DLL as i32);
    };
    let debug_create: DebugCreateFn = unsafe { std::mem::transmute(proc_addr) };

    let Ok(windir) = windows_dir() else {
        return failed("Couldn't find the Windows folder.".into());
    };
    let dump_paths = match list_dump_files(&windir) {
        Ok(paths) => paths,
        Err(msg) => return failed(msg),
    };
    if dump_paths.is_empty() {
        return AdminResult {
            task: "analyze-dumps".into(),
            ok: true,
            outcome: "no_dumps".into(),
            message: "No crash dumps found in Windows\\Minidump.".into(),
            exit_code: None,
            dumps: Vec::new(),
        };
    }

    let total = dump_paths.len();
    let mut analyses = Vec::with_capacity(total);
    for (idx, path) in dump_paths.iter().enumerate() {
        let file = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        on_progress(AdminEvent {
            stage: format!("Analysing {file}"),
            percent: Some((idx as f32 / total as f32) * 100.0),
        });
        analyses.push(analyze_one(debug_create, path, &file, &windir));
    }
    on_progress(AdminEvent { stage: "Finished crash dump analysis".into(), percent: Some(100.0) });

    let ok = analyses.iter().any(|d| d.error.is_none());
    let mut seen_suspects = HashSet::new();
    let suspects: Vec<&str> = analyses
        .iter()
        .filter_map(|d| d.suspect_module.as_deref())
        .filter(|s| seen_suspects.insert(s.to_ascii_lowercase()))
        .collect();
    let message = if !ok {
        analyses.iter().find_map(|d| d.error.clone()).unwrap_or_else(|| "Couldn't analyze crash dumps.".into())
    } else if suspects.is_empty() {
        format!("Analyzed {} crash dump(s).", analyses.len())
    } else {
        format!("Analyzed {} crash dump(s). Suspect driver(s): {}.", analyses.len(), suspects.join(", "))
    };
    AdminResult {
        task: "analyze-dumps".into(),
        ok,
        outcome: if ok { "analyzed" } else { "failed" }.into(),
        message,
        exit_code: None,
        dumps: analyses,
    }
}

fn windows_dir() -> Result<String, ()> {
    let mut buf = vec![0u16; 260];
    let len = unsafe { GetSystemWindowsDirectoryW(Some(&mut buf)) } as usize;
    if len == 0 {
        return Err(());
    }
    if len > buf.len() {
        buf.resize(len, 0);
        let len2 = unsafe { GetSystemWindowsDirectoryW(Some(&mut buf)) } as usize;
        if len2 == 0 || len2 > buf.len() {
            return Err(());
        }
        return Ok(String::from_utf16_lossy(&buf[..len2]));
    }
    Ok(String::from_utf16_lossy(&buf[..len]))
}

fn failed(message: String) -> AdminResult {
    AdminResult { task: "analyze-dumps".into(), ok: false, outcome: "failed".into(), message, exit_code: None, dumps: Vec::new() }
}

fn list_dump_files(windir: &str) -> Result<Vec<PathBuf>, String> {
    let dir = Path::new(windir).join("Minidump");
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Couldn't list crash dumps: {e}")),
    };
    let mut files: Vec<(i64, PathBuf)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("dmp")))
        .map(|e| {
            let secs = e
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            (secs, e.path())
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(files.into_iter().map(|(_, p)| p).collect())
}

fn analyze_one(debug_create: DebugCreateFn, path: &Path, file: &str, windir: &str) -> DumpAnalysis {
    let err_dump = |step: String| DumpAnalysis {
        file: file.to_string(),
        bugcheck_code: String::new(),
        parameters: Vec::new(),
        suspect_module: None,
        suspect_from: None,
        drivers: Vec::new(),
        drivers_label: "drivers present".into(),
        loaded_modules: 0,
        unloaded_modules: 0,
        error: Some(step),
    };

    let mut raw: *mut core::ffi::c_void = std::ptr::null_mut();
    if let Err(e) = unsafe { debug_create(&IDebugClient::IID, &mut raw) }.ok() {
        return err_dump(format!("DebugCreate failed: {e}"));
    }
    if raw.is_null() {
        return err_dump("DebugCreate returned a null interface".into());
    }
    let client = unsafe { IDebugClient::from_raw(raw) };
    let session = DebugSession(client);

    let Ok(client4) = session.0.cast::<IDebugClient4>() else {
        return err_dump("IDebugClient4 unavailable".into());
    };
    let Ok(control) = session.0.cast::<IDebugControl>() else {
        return err_dump("IDebugControl unavailable".into());
    };
    let Ok(symbols) = session.0.cast::<IDebugSymbols>() else {
        return err_dump("IDebugSymbols unavailable".into());
    };

    // Empty symbol path guarantees no network symbol downloads.
    if let Err(e) = unsafe { symbols.SetSymbolPath(s!("")) } {
        return err_dump(format!("SetSymbolPath failed: {e}"));
    }

    let wide_path: Vec<u16> = path.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    if let Err(e) = unsafe { client4.OpenDumpFileWide(PCWSTR(wide_path.as_ptr()), 0) } {
        return err_dump(format!("OpenDumpFileWide failed: {e}"));
    }
    if let Err(e) = unsafe { control.WaitForEvent(DEBUG_WAIT_DEFAULT, INFINITE) } {
        return err_dump(format!("WaitForEvent failed: {e}"));
    }

    let (mut code, mut arg1, mut arg2, mut arg3, mut arg4) = (0u32, 0u64, 0u64, 0u64, 0u64);
    if let Err(e) = unsafe { control.ReadBugCheckData(&mut code, &mut arg1, &mut arg2, &mut arg3, &mut arg4) } {
        return err_dump(format!("ReadBugCheckData failed: {e}"));
    }

    let (mut loaded, mut unloaded) = (0u32, 0u32);
    if let Err(e) = unsafe { symbols.GetNumberModules(&mut loaded, &mut unloaded) } {
        return err_dump(format!("GetNumberModules failed: {e}"));
    }

    let total = loaded.saturating_add(unloaded);
    let mut modules = Vec::with_capacity((total as usize).min(4096));
    for idx in 0..total {
        let mut param = DEBUG_MODULE_PARAMETERS::default();
        if unsafe { symbols.GetModuleParameters(1, None, idx, &mut param) }.is_err() {
            continue;
        }
        let (image_name, module_name) = read_module_names(&symbols, idx, param.Base);
        modules.push(ModuleInfo {
            base: param.Base,
            size: param.Size,
            image_name,
            module_name,
            loaded: idx < loaded,
        });
    }

    build_dump_analysis(file, code, [arg1, arg2, arg3, arg4], loaded, unloaded, &modules, windir)
}

fn read_module_names(symbols: &IDebugSymbols, idx: u32, base: u64) -> (String, String) {
    let mut img_buf = [0u8; 1024];
    let mut mod_buf = [0u8; 256];
    let mut ok = unsafe { symbols.GetModuleNames(idx, 0, Some(&mut img_buf), None, Some(&mut mod_buf), None, None, None) }.is_ok();
    if !ok && base != 0 {
        img_buf.fill(0);
        mod_buf.fill(0);
        ok = unsafe { symbols.GetModuleNames(u32::MAX, base, Some(&mut img_buf), None, Some(&mut mod_buf), None, None, None) }.is_ok();
    }
    if !ok {
        return (String::new(), String::new());
    }
    (c_buf_to_string(&img_buf), c_buf_to_string(&mod_buf))
}

fn c_buf_to_string(buf: &[u8]) -> String {
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).into_owned()
}

pub(crate) fn build_dump_analysis(
    file: &str,
    code: u32,
    params: [u64; 4],
    loaded_modules: u32,
    unloaded_modules: u32,
    modules: &[ModuleInfo],
    windir: &str,
) -> DumpAnalysis {
    let (suspect_module, suspect_from) = resolve_suspect(code, params, modules);
    let drivers_label = if suspect_module.is_some() { "cause" } else { "drivers present" }.to_string();
    let drivers = non_microsoft_drivers(modules, windir);

    DumpAnalysis {
        file: file.to_string(),
        bugcheck_code: format!("0x{code:08X}"),
        parameters: params.iter().map(|p| format!("0x{p:016x}")).collect(),
        suspect_module,
        suspect_from,
        drivers,
        drivers_label,
        loaded_modules,
        unloaded_modules,
        error: None,
    }
}

pub(crate) fn resolve_suspect(code: u32, params: [u64; 4], modules: &[ModuleInfo]) -> (Option<String>, Option<String>) {
    // Bugcheck-specific order puts the faulting instruction/driver address ahead of data addresses.
    let order: &[usize] = match code {
        0x000000CE => &[0, 2],       // DRIVER_UNLOADED_WITHOUT_CANCELLING_PENDING_OPERATIONS
        0x0000000A | 0x000000D1 => &[3, 0], // IRQL_NOT_LESS_OR_EQUAL / DRIVER_IRQL_NOT_LESS_OR_EQUAL
        0x00000050 => &[2, 0],       // PAGE_FAULT_IN_NONPAGED_AREA
        0x0000001E | 0x0000003B | 0x0000007E | 0x0000007F | 0x0000009F => &[1, 0, 2, 3],
        _ => &[0, 1, 2, 3],
    };

    // For 0xCE the driver is by definition unloaded, so check unloaded modules first.
    let search_unloaded_first = code == 0x000000CE;
    for &pi in order {
        let addr = params[pi];
        if addr == 0 {
            continue;
        }
        for want_loaded in [!search_unloaded_first, search_unloaded_first] {
            if let Some(m) = modules.iter().find(|m| m.loaded == want_loaded && addr_in_module(addr, m.base, m.size)) {
                let name = short_module_name(&m.image_name, &m.module_name);
                if !name.is_empty() {
                    let from = if m.loaded { "loaded" } else { "unloaded" };
                    return (Some(name), Some(from.to_string()));
                }
            }
        }
    }
    (None, None)
}

pub(crate) fn addr_in_module(addr: u64, base: u64, size: u32) -> bool {
    base != 0 && size > 0 && addr >= base && addr < base.saturating_add(size as u64)
}

pub(crate) fn short_module_name(image_name: &str, module_name: &str) -> String {
    let base = image_name.rsplit(['\\', '/']).next().unwrap_or("").trim();
    if !base.is_empty() { base.to_string() } else { module_name.trim().to_string() }
}

/// True if `image_path` has a directory path and points outside the Windows folder.
pub(crate) fn is_outside_windows_folder(image_path: &str, windir: &str) -> bool {
    let mut p = image_path.trim().replace('/', "\\").to_ascii_lowercase();
    for prefix in [r"\??\", r"\\?\"] {
        if let Some(rest) = p.strip_prefix(prefix) {
            p = rest.to_string();
        }
    }
    if p.is_empty() || !p.contains('\\') {
        return false;
    }
    if p.starts_with(r"\systemroot\")
        || p.starts_with(r"systemroot\")
        || p.starts_with(r"%systemroot%\")
        || p.starts_with(r"%windir%\")
        || p.starts_with(r"system32\")
        || p.starts_with(r"syswow64\")
    {
        return false;
    }
    let win_norm = windir.trim().replace('/', "\\").trim_end_matches('\\').to_ascii_lowercase();
    if !win_norm.is_empty() && (p == win_norm || p.starts_with(&format!(r"{win_norm}\"))) {
        return false;
    }
    // Kernel object paths sometimes use \Device\HarddiskVolumeN\Windows\...
    if let Some(rest) = p.strip_prefix(r"\device\harddiskvolume") {
        let after_vol = rest.trim_start_matches(|c: char| c.is_ascii_digit());
        let win_tail = win_norm.split_once(':').map(|(_, tail)| tail).unwrap_or(r"\windows");
        if after_vol == win_tail || after_vol.starts_with(&format!(r"{win_tail}\")) {
            return false;
        }
    }
    true
}

pub(crate) fn non_microsoft_drivers(modules: &[ModuleInfo], windir: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for m in modules {
        if is_outside_windows_folder(&m.image_name, windir) {
            let name = short_module_name(&m.image_name, &m.module_name);
            if !name.is_empty() && seen.insert(name.to_ascii_lowercase()) {
                out.push(name);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mod_info(base: u64, size: u32, image: &str, module: &str, loaded: bool) -> ModuleInfo {
        ModuleInfo { base, size, image_name: image.into(), module_name: module.into(), loaded }
    }

    #[test]
    fn resolves_unloaded_vgk_in_0xce_dump() {
        let modules = vec![
            mod_info(0xfffff807_10000000, 0x1000000, r"\SystemRoot\system32\ntoskrnl.exe", "nt", true),
            mod_info(0xfffff807_20000000, 0x50000, r"\SystemRoot\System32\DriverStore\FileRepository\iigd\igdkmd64.sys", "igdkmd64", true),
            mod_info(0xfffff807_8e6c0000, 0x120000, "vgk.sys", "vgk", false),
        ];
        let analysis = build_dump_analysis(
            "112526-14828-01.dmp",
            0x000000CE,
            [0xfffff807_8e6cd9bd, 0x8, 0xfffff807_8e6cd9bd, 0],
            2,
            1,
            &modules,
            r"C:\Windows",
        );
        assert_eq!(analysis.bugcheck_code, "0x000000CE");
        assert_eq!(analysis.suspect_module.as_deref(), Some("vgk.sys"));
        assert_eq!(analysis.suspect_from.as_deref(), Some("unloaded"));
        assert_eq!(analysis.drivers_label, "cause");
    }

    #[test]
    fn resolves_loaded_driver_and_filters_windows_paths() {
        let modules = vec![
            mod_info(0xfffff807_10000000, 0x100000, r"\SystemRoot\system32\ntoskrnl.exe", "nt", true),
            mod_info(0xfffff807_30000000, 0x20000, r"C:\Windows\System32\drivers\tcpip.sys", "tcpip", true),
            mod_info(0xfffff807_40000000, 0x10000, r"\Device\HarddiskVolume3\Windows\System32\drivers\afd.sys", "afd", true),
            mod_info(0xfffff807_50000000, 0x80000, r"\??\C:\Program Files\Riot Vanguard\vgk.sys", "vgk", true),
            mod_info(0xfffff807_60000000, 0x40000, r"C:\Program Files\SomeTool\helper.sys", "helper", true),
        ];
        // 0x50 checks arg3 (IP) first
        let a = build_dump_analysis(
            "112426-14921-01.dmp",
            0x00000050,
            [0xdeadbeef, 0, 0xfffff807_50001234, 0],
            5,
            0,
            &modules,
            r"C:\Windows",
        );
        assert_eq!(a.suspect_module.as_deref(), Some("vgk.sys"));
        assert_eq!(a.suspect_from.as_deref(), Some("loaded"));
        assert_eq!(a.drivers_label, "cause");
        assert_eq!(a.drivers, vec!["vgk.sys", "helper.sys"]);

        // Unresolved faulting address sets drivers_label to "drivers present"
        let b = build_dump_analysis("x.dmp", 0x00000050, [0xdeadbeef, 0, 0x1234, 0], 5, 0, &modules, r"C:\Windows");
        assert_eq!(b.suspect_module, None);
        assert_eq!(b.suspect_from, None);
        assert_eq!(b.drivers_label, "drivers present");
        assert_eq!(b.drivers, vec!["vgk.sys", "helper.sys"]);
    }

    #[test]
    fn outside_windows_folder_checks_edge_cases() {
        assert!(!is_outside_windows_folder(r"\SystemRoot\System32\drivers\disk.sys", r"C:\Windows"));
        assert!(!is_outside_windows_folder(r"C:\WINDOWS\System32\ntoskrnl.exe", r"C:\Windows"));
        assert!(!is_outside_windows_folder(r"\??\C:\Windows\System32\win32k.sys", r"C:\Windows"));
        assert!(!is_outside_windows_folder(r"\Device\HarddiskVolume3\Windows\System32\hal.dll", r"C:\Windows"));
        assert!(!is_outside_windows_folder("vgk.sys", r"C:\Windows"));
        assert!(is_outside_windows_folder(r"\??\C:\Program Files\Riot Vanguard\vgk.sys", r"C:\Windows"));
        assert!(is_outside_windows_folder(r"C:\ProgramData\Driver\custom.sys", r"C:\Windows"));
    }
}
