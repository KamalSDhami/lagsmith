//! Elevated helper binary (`lagsmith-helper.exe`) launched via UAC for the 4 allow-listed admin tasks.
//! Never runs unattended tests with UAC; verifies the caller pipe belongs to `lagsmith.exe` beside it.

#[allow(dead_code)]
#[path = "../../src/model.rs"]
mod model;
#[allow(dead_code)]
#[path = "../../src/admin/protocol.rs"]
mod protocol;
#[allow(dead_code)]
#[path = "../../src/scan/protected.rs"]
mod protected;
mod dumps;

use model::{AdminEvent, AdminResult};
use protocol::{EXIT_BAD_ARGS, EXIT_GAME_RUNNING, EXIT_PIPE_REFUSED, EXIT_SYSTEM_DLL, HelperMessage};
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use windows::Win32::Foundation::{
    CloseHandle, ERROR_ALREADY_EXISTS, ERROR_SERVICE_DISABLED, ERROR_SUCCESS, FreeLibrary, GENERIC_WRITE, HANDLE, HMODULE,
};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_NONE, FlushFileBuffers, OPEN_EXISTING, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT, WriteFile,
};
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW, SetDefaultDllDirectories,
};
use windows::Win32::System::Pipes::GetNamedPipeServerProcessId;
use windows::Win32::System::Restore::{
    BEGIN_SYSTEM_CHANGE, END_SYSTEM_CHANGE, MODIFY_SETTINGS, RESTOREPOINTINFOW, STATEMGRSTATUS,
};
use windows::Win32::System::SystemInformation::GetSystemDirectoryW;
use windows::Win32::System::Threading::{
    CREATE_NO_WINDOW, OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::core::{BOOL, PCWSTR, PWSTR, s, w};

const MAX_TOOL_TEXT: usize = 2 << 20;

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

struct Library(HMODULE);
impl Drop for Library {
    fn drop(&mut self) {
        let _ = unsafe { FreeLibrary(self.0) };
    }
}

struct PipeWriter(Handle);
impl PipeWriter {
    fn send(&self, msg: &HelperMessage) {
        let Ok(mut line) = serde_json::to_string(msg) else {
            return;
        };
        line.push('\n');
        let bytes = line.as_bytes();
        let mut offset = 0;
        while offset < bytes.len() {
            let mut n = 0u32;
            if unsafe { WriteFile(self.0.0, Some(&bytes[offset..]), Some(&mut n), None) }.is_err() || n == 0 {
                break;
            }
            offset += n as usize;
        }
    }

    fn flush(&self) {
        let _ = unsafe { FlushFileBuffers(self.0.0) };
    }
}

fn main() {
    // Restrict DLL loading to System32 immediately before loading any optional system DLL.
    if unsafe { SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32) }.is_err() {
        std::process::exit(EXIT_SYSTEM_DLL as i32);
    }

    let args: Vec<String> = std::env::args().collect();
    let tail = args.get(1..).unwrap_or(&[]);
    let Some((action, pipe_name)) = protocol::parse_args(tail) else {
        std::process::exit(EXIT_BAD_ARGS as i32);
    };

    let Ok(running) = protected::process_names() else {
        std::process::exit(EXIT_GAME_RUNNING as i32);
    };
    if protected::gate(&running).is_err() {
        std::process::exit(EXIT_GAME_RUNNING as i32);
    }

    let Some(pipe) = connect_and_verify_pipe(pipe_name) else {
        std::process::exit(EXIT_PIPE_REFUSED as i32);
    };

    let result = match action {
        "restore-point" => run_restore_point(&pipe),
        "sfc" => run_sfc(&pipe),
        "dism-restorehealth" => run_dism(&pipe),
        "analyze-dumps" => dumps::run(|ev| pipe.send(&HelperMessage::Progress(ev))),
        _ => std::process::exit(EXIT_BAD_ARGS as i32),
    };

    pipe.send(&HelperMessage::Done(result));
    pipe.flush();
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn connect_and_verify_pipe(pipe_name: &str) -> Option<PipeWriter> {
    let w = wide(pipe_name);
    let h = unsafe {
        CreateFileW(
            PCWSTR(w.as_ptr()),
            GENERIC_WRITE.0,
            FILE_SHARE_NONE,
            None,
            OPEN_EXISTING,
            SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
            None,
        )
    }
    .ok()?;
    let pipe = Handle(h);

    let mut server_pid = 0u32;
    unsafe { GetNamedPipeServerProcessId(pipe.0, &mut server_pid) }.ok()?;
    let proc = Handle(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, server_pid) }.ok()?);

    let mut buf = vec![0u16; 32768];
    let mut len = buf.len() as u32;
    unsafe { QueryFullProcessImageNameW(proc.0, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len) }.ok()?;
    let server_path = PathBuf::from(String::from_utf16_lossy(&buf[..len as usize]));

    let self_exe = std::env::current_exe().ok()?;
    let expected = self_exe.parent()?.join("lagsmith.exe");
    if !same_exe_path(&server_path, &expected) {
        return None;
    }

    Some(PipeWriter(pipe))
}

fn same_exe_path(actual: &Path, expected: &Path) -> bool {
    let Ok(a) = std::fs::canonicalize(actual) else {
        return false;
    };
    let Ok(e) = std::fs::canonicalize(expected) else {
        return false;
    };
    a.to_string_lossy().to_lowercase() == e.to_string_lossy().to_lowercase()
}

fn system32_dir() -> Result<PathBuf, String> {
    let mut buf = vec![0u16; 260];
    let len = unsafe { GetSystemDirectoryW(Some(&mut buf)) } as usize;
    if len == 0 {
        return Err("Couldn't locate System32.".into());
    }
    if len > buf.len() {
        buf.resize(len, 0);
        let len2 = unsafe { GetSystemDirectoryW(Some(&mut buf)) } as usize;
        if len2 == 0 || len2 > buf.len() {
            return Err("Couldn't locate System32.".into());
        }
        return Ok(PathBuf::from(String::from_utf16_lossy(&buf[..len2])));
    }
    Ok(PathBuf::from(String::from_utf16_lossy(&buf[..len])))
}

// ---------- restore-point

fn run_restore_point(pipe: &PipeWriter) -> AdminResult {
    type SrSetRestorePointWFn = unsafe extern "system" fn(*const RESTOREPOINTINFOW, *mut STATEMGRSTATUS) -> BOOL;
    let lib = match unsafe { LoadLibraryExW(w!("srclient.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) } {
        Ok(h) => Library(h),
        Err(_) => std::process::exit(EXIT_SYSTEM_DLL as i32),
    };
    let Some(proc_addr) = (unsafe { GetProcAddress(lib.0, s!("SRSetRestorePointW")) }) else {
        drop(lib);
        std::process::exit(EXIT_SYSTEM_DLL as i32);
    };
    let sr_set: SrSetRestorePointWFn = unsafe { std::mem::transmute(proc_addr) };

    pipe.send(&HelperMessage::Progress(AdminEvent {
        stage: "Creating Windows restore point".into(),
        percent: None,
    }));

    let desc: Vec<u16> = "Lagsmith system checkpoint".encode_utf16().collect();
    let n = desc.len().min(255);
    let mut sz_description = [0u16; 256];
    sz_description[..n].copy_from_slice(&desc[..n]);
    let mut info = RESTOREPOINTINFOW {
        dwEventType: BEGIN_SYSTEM_CHANGE,
        dwRestorePtType: MODIFY_SETTINGS,
        llSequenceNumber: 0,
        szDescription: sz_description,
    };

    let mut status = STATEMGRSTATUS::default();
    let begin_ok = unsafe { sr_set(&info, &mut status) }.as_bool();
    let begin_code = { status.nStatus }.0;
    let seq = { status.llSequenceNumber };
    if !begin_ok {
        return map_restore_error(begin_code);
    }

    if begin_code == ERROR_ALREADY_EXISTS.0 || seq == 0 {
        if seq != 0 {
            let mut end_status = STATEMGRSTATUS::default();
            info.dwEventType = END_SYSTEM_CHANGE;
            info.llSequenceNumber = seq;
            let _ = unsafe { sr_set(&info, &mut end_status) };
        }
        return AdminResult {
            task: "restore-point".into(),
            ok: true,
            outcome: "already_exists".into(),
            message: "A recent restore point already exists (Windows limits automatic creation to once every 24 hours).".into(),
            exit_code: None,
            dumps: Vec::new(),
        };
    }

    info.dwEventType = END_SYSTEM_CHANGE;
    info.llSequenceNumber = seq;
    let mut end_status = STATEMGRSTATUS::default();
    let end_ok = unsafe { sr_set(&info, &mut end_status) }.as_bool();
    let end_code = { end_status.nStatus }.0;
    if !end_ok && end_code != ERROR_SUCCESS.0 {
        return map_restore_error(end_code);
    }

    AdminResult {
        task: "restore-point".into(),
        ok: true,
        outcome: "created".into(),
        message: "Created a Windows restore point.".into(),
        exit_code: None,
        dumps: Vec::new(),
    }
}

fn map_restore_error(code: u32) -> AdminResult {
    let (ok, outcome, message) = if code == ERROR_SERVICE_DISABLED.0 {
        (false, "protection_off", "System Protection is turned off. Turn it on in System Properties to create restore points.".to_string())
    } else if code == ERROR_ALREADY_EXISTS.0 {
        (true, "already_exists", "A recent restore point already exists.".to_string())
    } else {
        (false, "failed", format!("Couldn't create a restore point (Windows error {code})."))
    };
    AdminResult {
        task: "restore-point".into(),
        ok,
        outcome: outcome.into(),
        message,
        exit_code: Some(code),
        dumps: Vec::new(),
    }
}

// ---------- sfc

fn run_sfc(pipe: &PipeWriter) -> AdminResult {
    let sys32 = match system32_dir() {
        Ok(p) => p,
        Err(msg) => return failed_tool("sfc", msg, None),
    };
    let mut child = match Command::new(sys32.join("sfc.exe"))
        .arg("/scannow")
        .creation_flags(CREATE_NO_WINDOW.0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return failed_tool("sfc", format!("Couldn't start System File Checker: {e}"), None),
    };

    pipe.send(&HelperMessage::Progress(AdminEvent {
        stage: "Starting System File Checker".into(),
        percent: Some(0.0),
    }));

    let mut full = String::new();
    let mut line_buf = String::new();
    let mut carry = None;
    let mut last_pct: Option<u32> = None;

    if let Some(mut stdout) = child.stdout.take() {
        let mut buf = [0u8; 512];
        while let Ok(n) = stdout.read(&mut buf) {
            if n == 0 {
                break;
            }
            let chunk = decode_utf16le_chunk(&buf[..n], &mut carry);
            push_capped(&mut full, &chunk);
            stream_segments(&chunk, &mut line_buf, |seg| {
                if let Some(ev) = parse_sfc_progress(seg) {
                    let pct = ev.percent.map(|p| p.round() as u32);
                    if pct != last_pct {
                        last_pct = pct;
                        pipe.send(&HelperMessage::Progress(ev));
                    }
                    return true;
                }
                false
            });
        }
    }
    if !line_buf.trim().is_empty()
        && let Some(ev) = parse_sfc_progress(&line_buf)
        && ev.percent.map(|p| p.round() as u32) != last_pct
    {
        pipe.send(&HelperMessage::Progress(ev));
    }

    let exit_code = child.wait().ok().and_then(|s| s.code().map(|c| c as u32));
    let (ok, outcome, message) = parse_sfc_outcome(&full, exit_code);
    AdminResult {
        task: "sfc".into(),
        ok,
        outcome: outcome.into(),
        message,
        exit_code,
        dumps: Vec::new(),
    }
}

/// Decodes a UTF-16LE byte chunk (such as `sfc.exe` output with NULs), carrying any trailing odd byte.
pub(crate) fn decode_utf16le_chunk(chunk: &[u8], carry: &mut Option<u8>) -> String {
    let mut bytes = Vec::with_capacity(chunk.len() + 1);
    if let Some(b) = carry.take() {
        bytes.push(b);
    }
    bytes.extend_from_slice(chunk);
    if bytes.len() % 2 == 1 {
        *carry = bytes.pop();
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .filter(|&u| u != 0 && u != 0xFEFF)
        .collect();
    String::from_utf16_lossy(&units)
}

pub(crate) fn parse_sfc_progress(segment: &str) -> Option<AdminEvent> {
    let lower = segment.to_ascii_lowercase();
    let idx = lower.find("verification ")?;
    let rest = &segment[idx + "verification ".len()..];
    let pct_pos = rest.find('%')?;
    let num_str = rest[..pct_pos].trim();
    if num_str.is_empty() || !num_str.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let pct: f32 = num_str.parse().ok()?;
    if !(0.0..=100.0).contains(&pct) {
        return None;
    }
    Some(AdminEvent { stage: format!("Verification {num_str}% complete"), percent: Some(pct) })
}

pub(crate) fn parse_sfc_outcome(text: &str, exit_code: Option<u32>) -> (bool, &'static str, String) {
    let lower = text.to_ascii_lowercase();
    if lower.contains("did not find any integrity violations") {
        (true, "no_problems", "Windows Resource Protection did not find any integrity violations.".into())
    } else if lower.contains("successfully repaired") {
        (true, "repaired", "Windows Resource Protection found corrupt files and successfully repaired them.".into())
    } else if lower.contains("unable to fix") || lower.contains("could not repair") {
        (false, "could_not_repair", "Windows Resource Protection found corrupt files but was unable to fix some of them.".into())
    } else if lower.contains("could not perform") || lower.contains("could not start") {
        (false, "failed", "Windows Resource Protection could not perform the requested operation.".into())
    } else if exit_code == Some(0) {
        (true, "no_problems", "System File Checker finished.".into())
    } else {
        let code_note = exit_code.map(|c| format!(" (exit code {c})")).unwrap_or_default();
        (false, "failed", format!("System File Checker failed{code_note}."))
    }
}

// ---------- dism-restorehealth

fn run_dism(pipe: &PipeWriter) -> AdminResult {
    let sys32 = match system32_dir() {
        Ok(p) => p,
        Err(msg) => return failed_tool("dism-restorehealth", msg, None),
    };
    let mut child = match Command::new(sys32.join("dism.exe"))
        .args(["/Online", "/Cleanup-Image", "/RestoreHealth"])
        .creation_flags(CREATE_NO_WINDOW.0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return failed_tool("dism-restorehealth", format!("Couldn't start DISM: {e}"), None),
    };

    pipe.send(&HelperMessage::Progress(AdminEvent {
        stage: "Starting DISM component repair".into(),
        percent: Some(0.0),
    }));

    let mut full = String::new();
    let mut line_buf = String::new();
    let mut last_tenths: Option<u32> = None;

    if let Some(mut stdout) = child.stdout.take() {
        let mut buf = [0u8; 512];
        while let Ok(n) = stdout.read(&mut buf) {
            if n == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
            push_capped(&mut full, &chunk);
            stream_segments(&chunk, &mut line_buf, |seg| {
                if let Some(ev) = parse_dism_progress(seg) {
                    let tenths = ev.percent.map(|p| (p * 10.0).round() as u32);
                    if tenths != last_tenths {
                        last_tenths = tenths;
                        pipe.send(&HelperMessage::Progress(ev));
                    }
                    return true;
                }
                false
            });
        }
    }
    if !line_buf.trim().is_empty()
        && let Some(ev) = parse_dism_progress(&line_buf)
        && ev.percent.map(|p| (p * 10.0).round() as u32) != last_tenths
    {
        pipe.send(&HelperMessage::Progress(ev));
    }

    let exit_code = child.wait().ok().and_then(|s| s.code().map(|c| c as u32));
    let (ok, outcome, message) = parse_dism_outcome(&full, exit_code);
    AdminResult {
        task: "dism-restorehealth".into(),
        ok,
        outcome: outcome.into(),
        message,
        exit_code,
        dumps: Vec::new(),
    }
}

pub(crate) fn parse_dism_progress(segment: &str) -> Option<AdminEvent> {
    let open = segment.find('[')?;
    let inside = &segment[open + 1..];
    let pct_pos = inside.find('%')?;
    let before_pct = inside[..pct_pos].trim_end();
    let start = before_pct
        .char_indices()
        .rev()
        .find(|&(_, c)| !c.is_ascii_digit() && c != '.')
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(0);
    let num_str = &before_pct[start..];
    if num_str.is_empty() {
        return None;
    }
    let pct: f32 = num_str.parse().ok()?;
    if !(0.0..=100.0).contains(&pct) {
        return None;
    }
    Some(AdminEvent {
        stage: format!("Restoring Windows image ({pct:.1}%)"),
        percent: Some(pct),
    })
}

pub(crate) fn parse_dism_outcome(text: &str, exit_code: Option<u32>) -> (bool, &'static str, String) {
    let lower = text.to_ascii_lowercase();
    if matches!(exit_code, Some(0x800f081f) | Some(0x800f0915))
        || lower.contains("800f081f")
        || lower.contains("800f0915")
        || lower.contains("source files could not be found")
        || lower.contains("repair content could not be found")
    {
        let code = match exit_code {
            Some(0x800f0915) => "0x800f0915",
            Some(0x800f081f) => "0x800f081f",
            _ if lower.contains("800f0915") => "0x800f0915",
            _ => "0x800f081f",
        };
        return (
            false,
            "source_missing",
            format!("DISM could not find the repair source files ({code})."),
        );
    }
    if lower.contains("no component store corruption detected") {
        return (true, "no_problems", "No Windows component store corruption detected.".into());
    }
    if exit_code == Some(3010) {
        return (true, "repaired", "DISM completed the Windows image repair. Restart your PC to finish applying changes.".into());
    }
    if exit_code == Some(0) || lower.contains("restore operation completed successfully") {
        return (true, "repaired", "DISM completed the Windows image repair.".into());
    }
    let code_note = exit_code.map(|c| format!(" (exit code {c})")).unwrap_or_default();
    (false, "failed", format!("DISM RestoreHealth failed{code_note}."))
}

fn failed_tool(task: &str, message: String, exit_code: Option<u32>) -> AdminResult {
    AdminResult { task: task.into(), ok: false, outcome: "failed".into(), message, exit_code, dumps: Vec::new() }
}

fn push_capped(dst: &mut String, chunk: &str) {
    if dst.len() < MAX_TOOL_TEXT {
        let take = (MAX_TOOL_TEXT - dst.len()).min(chunk.len());
        let mut end = take;
        while end > 0 && !chunk.is_char_boundary(end) {
            end -= 1;
        }
        dst.push_str(&chunk[..end]);
    }
}

/// Splits incoming chunks on `\r` or `\n`, and also inspects the live buffer so leading-`\r` updates emit immediately.
fn stream_segments(chunk: &str, buf: &mut String, mut on_segment: impl FnMut(&str) -> bool) {
    buf.push_str(chunk);
    while let Some(pos) = buf.find(['\r', '\n']) {
        let seg = buf[..pos].to_string();
        buf.drain(..=pos);
        if !seg.trim().is_empty() {
            on_segment(&seg);
        }
    }
    if !buf.trim().is_empty() && on_segment(buf) {
        buf.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sfc_utf16le_chunks_across_odd_splits() {
        let msg = "Beginning system scan.\r\nVerification 45% complete.\r\nWindows Resource Protection did not find any integrity violations.\r\n";
        let utf16_bytes: Vec<u8> = std::iter::once(0xFEFFu16)
            .chain(msg.encode_utf16())
            .flat_map(|u| u.to_le_bytes())
            .collect();

        // Split at odd byte boundaries to exercise carry-over decoding.
        let mut carry = None;
        let mut decoded = String::new();
        for part in utf16_bytes.chunks(7) {
            decoded.push_str(&decode_utf16le_chunk(part, &mut carry));
        }
        assert!(carry.is_none());
        assert!(!decoded.contains('\0'));
        assert!(!decoded.contains('\u{feff}'));
        assert_eq!(decoded, msg);

        let mut line_buf = String::new();
        let mut events = Vec::new();
        let mut carry2 = None;
        for part in utf16_bytes.chunks(11) {
            let ch = decode_utf16le_chunk(part, &mut carry2);
            stream_segments(&ch, &mut line_buf, |seg| {
                if let Some(ev) = parse_sfc_progress(seg) {
                    events.push(ev);
                    true
                } else {
                    false
                }
            });
        }
        assert_eq!(events, vec![AdminEvent { stage: "Verification 45% complete".into(), percent: Some(45.0) }]);
        assert_eq!(parse_sfc_outcome(&decoded, Some(0)).1, "no_problems");
        assert_eq!(parse_sfc_outcome("Windows Resource Protection found corrupt files and successfully repaired them.", Some(0)).1, "repaired");
        assert_eq!(parse_sfc_outcome("Windows Resource Protection found corrupt files but was unable to fix some of them.", Some(1)).1, "could_not_repair");
        assert_eq!(parse_sfc_outcome("Windows Resource Protection could not perform the requested operation.", Some(1)).1, "failed");
    }

    #[test]
    fn parses_dism_cr_progress_and_source_missing() {
        let stream = "\r[== 12.5% ]\r[========= 45.0% =========]\r[==========================100.0%==========================]\n";
        let mut buf = String::new();
        let mut percents = Vec::new();
        for chunk in stream.as_bytes().chunks(9) {
            let s = String::from_utf8_lossy(chunk);
            stream_segments(&s, &mut buf, |seg| {
                if let Some(ev) = parse_dism_progress(seg) {
                    percents.push(ev.percent.expect("pct"));
                    true
                } else {
                    false
                }
            });
        }
        assert_eq!(percents, vec![12.5, 45.0, 100.0]);

        let err_out = "Error: 0x800f081f\nThe source files could not be found.\n";
        let (ok, outcome, _) = parse_dism_outcome(err_out, Some(0x800f081f));
        assert!(!ok);
        assert_eq!(outcome, "source_missing");

        let (ok2, outcome2, _) = parse_dism_outcome("The restore operation completed successfully.", Some(0));
        assert!(ok2);
        assert_eq!(outcome2, "repaired");

        // Non-ASCII character immediately before percentage must not panic.
        assert_eq!(parse_dism_progress("[…45.0%]").and_then(|e| e.percent), Some(45.0));

        // Exit code 3010 (reboot required) and localized 0x800f0915 without English text.
        let (ok3, outcome3, _) = parse_dism_outcome("", Some(3010));
        assert!(ok3);
        assert_eq!(outcome3, "repaired");

        let (ok4, outcome4, msg4) = parse_dism_outcome("", Some(0x800f0915));
        assert!(!ok4);
        assert_eq!(outcome4, "source_missing");
        assert!(msg4.contains("0x800f0915"), "{msg4}");
    }
}
