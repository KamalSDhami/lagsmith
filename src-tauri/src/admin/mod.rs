//! App side of the elevated helper: a private named pipe, a `runas` launch of lagsmith-helper.exe
//! from the app's own folder, and a reader that forwards progress lines to the UI.

pub mod background;
pub mod protocol;

use crate::model::{AdminEvent, AdminResult};
use crate::scan::{protected, wide};
use protocol::{EXIT_BAD_ARGS, EXIT_GAME_RUNNING, EXIT_PIPE_REFUSED, EXIT_SYSTEM_DLL, HelperMessage, valid_action};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use windows::Win32::Foundation::{
    CloseHandle, ERROR_BROKEN_PIPE, ERROR_CANCELLED, ERROR_IO_PENDING, ERROR_PIPE_CONNECTED, HANDLE, HLOCAL, LocalFree,
    WAIT_OBJECT_0,
};
use windows::Win32::Security::Authorization::{ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW};
use windows::Win32::Security::Cryptography::{BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom};
use windows::Win32::Security::{GetTokenInformation, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER, TokenUser};
use windows::Win32::Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, PIPE_ACCESS_INBOUND, ReadFile};
use windows::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows::Win32::System::Threading::{
    CreateEventW, GetCurrentProcess, GetExitCodeProcess, GetProcessId, INFINITE, OpenProcessToken, WaitForMultipleObjects, WaitForSingleObject,
};
use windows::core::{PCWSTR, PWSTR};

const MAX_OUTPUT: usize = 4 << 20; // the helper's messages are small; stop reading past this

/// The app-started admin task that is running now, by display name. One at a time: the helper and the
/// tools it drives (sfc.exe, DISM) don't share well. Dropping `Busy` releases it on every exit path.
static RUNNING: Mutex<Option<&'static str>> = Mutex::new(None);

fn task_label(task: &str) -> &'static str {
    match task {
        "sfc" => "SFC",
        "dism-restorehealth" => "DISM",
        "restore-point" => "Restore point creation",
        _ => "Crash dump analysis",
    }
}

/// Name of the admin task Lagsmith is running now, if any (the close prompt uses it).
pub fn running_task() -> Option<&'static str> {
    *RUNNING.lock().unwrap_or_else(|e| e.into_inner())
}

struct Busy;
impl Busy {
    fn acquire(task: &str) -> Result<Busy, String> {
        let mut g = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(t) = *g {
            return Err(format!("{t} is still running. Wait for it to finish (progress is on the System Repair page), then try again."));
        }
        *g = Some(task_label(task));
        Ok(Busy)
    }
}
impl Drop for Busy {
    fn drop(&mut self) {
        *RUNNING.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

pub(crate) struct Handle(pub HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

pub fn run_admin_task(task: &str, on_event: impl Fn(AdminEvent)) -> Result<AdminResult, String> {
    if !valid_action(task) {
        return Err("Unknown admin task".into());
    }
    let names = protected::process_names()?;
    protected::gate(&names)?;
    let _busy = Busy::acquire(task)?;
    if let Some(msg) = background::conflict(task, &names) {
        return Err(msg);
    }
    let helper = helper_path()?;
    let (name, pipe) = create_pipe()?;
    let process = launch(&helper, task, &name)?;
    let pid = unsafe { GetProcessId(process.0) };
    if pid == 0 {
        return Err("Couldn't identify the admin helper process".into());
    }
    serve(&pipe, &process, Some(pid), on_event)
}

/// lagsmith-helper.exe beside the running exe. Never PATH or the current directory.
fn helper_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Couldn't find Lagsmith's folder: {e}"))?;
    let helper = exe.parent().ok_or("Couldn't find Lagsmith's folder")?.join("lagsmith-helper.exe");
    if !helper.is_file() {
        return Err(format!("The admin helper is missing ({}). Reinstall Lagsmith.", helper.display()));
    }
    Ok(helper)
}

fn random_hex() -> Result<String, String> {
    let mut b = [0u8; 16];
    unsafe { BCryptGenRandom(None, &mut b, BCRYPT_USE_SYSTEM_PREFERRED_RNG) }.ok().map_err(|e| format!("Couldn't create a random pipe name: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// The current user's SID as a string, e.g. "S-1-5-21-...".
fn user_sid() -> Result<String, String> {
    let fail = |e: windows::core::Error| format!("Couldn't read your user account: {e}");
    let mut token = HANDLE::default();
    unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) }.map_err(fail)?;
    let token = Handle(token);
    let mut len = 0u32;
    let _ = unsafe { GetTokenInformation(token.0, TokenUser, None, 0, &mut len) };
    let mut buf = vec![0u64; (len as usize).div_ceil(8)];
    unsafe { GetTokenInformation(token.0, TokenUser, Some(buf.as_mut_ptr().cast()), len, &mut len) }.map_err(fail)?;
    let user = unsafe { &*buf.as_ptr().cast::<TOKEN_USER>() };
    let mut s = PWSTR::null();
    unsafe { ConvertSidToStringSidW(user.User.Sid, &mut s) }.map_err(fail)?;
    let sid = unsafe { s.to_string() }.map_err(|e| e.to_string());
    unsafe { LocalFree(Some(HLOCAL(s.0.cast()))) };
    sid
}

/// A single-instance, local-only, inbound pipe that only the current user can open.
/// shortcut: if the admin prompt signs in as a DIFFERENT account (a standard user elevating with an
/// admin's password), that account isn't in the DACL and the helper can't connect; it then exits 4.
pub(crate) fn create_pipe() -> Result<(String, Handle), String> {
    let name = format!(r"\\.\pipe\lagsmith-{}", random_hex()?);
    let sddl = wide(&format!("D:P(A;;GA;;;{})", user_sid()?));
    let mut sd = PSECURITY_DESCRIPTOR::default();
    unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(PCWSTR(sddl.as_ptr()), 1, &mut sd, None) }
        .map_err(|e| format!("Couldn't secure the pipe: {e}"))?;
    let sa = SECURITY_ATTRIBUTES { nLength: size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd.0, bInheritHandle: false.into() };
    let w = wide(&name);
    let h = unsafe {
        CreateNamedPipeW(
            PCWSTR(w.as_ptr()),
            PIPE_ACCESS_INBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            0,
            64 * 1024,
            0,
            Some(&sa),
        )
    };
    unsafe { LocalFree(Some(HLOCAL(sd.0))) };
    if h.is_invalid() {
        return Err(format!("Couldn't create the pipe: {}", windows::core::Error::from_thread()));
    }
    Ok((name, Handle(h)))
}

/// The one call that shows the UAC prompt. Kept tiny; never called from tests.
fn launch(helper: &Path, task: &str, pipe: &str) -> Result<Handle, String> {
    use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoInitializeEx, CoUninitialize};
    use windows::Win32::UI::Shell::{SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW};
    let file = wide(&helper.to_string_lossy());
    let dir = wide(&helper.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default());
    let params = wide(&format!("{task} {pipe}")); // both validated: an allow-listed id and our own pipe name
    // ShellExecuteEx wants an STA; a fresh thread keeps that away from Tauri's pooled threads.
    let raw = std::thread::spawn(move || {
        let co = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
        let verb = wide("runas");
        let mut info = SHELLEXECUTEINFOW {
            cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(file.as_ptr()),
            lpParameters: PCWSTR(params.as_ptr()),
            lpDirectory: PCWSTR(dir.as_ptr()),
            nShow: 0, // SW_HIDE
            ..Default::default()
        };
        let r = unsafe { ShellExecuteExW(&mut info) }.map(|()| info.hProcess.0 as isize);
        if co.is_ok() {
            unsafe { CoUninitialize() };
        }
        r
    })
    .join()
    .map_err(|_| "Starting the admin helper crashed".to_string())?;
    match raw {
        Ok(0) => Err("Windows didn't start the admin helper".into()),
        Ok(h) => Ok(Handle(HANDLE(h as _))),
        Err(e) if e.code() == ERROR_CANCELLED.to_hresult() => Err("You declined the admin prompt.".into()),
        Err(e) => Err(format!("Couldn't start the admin helper: {e}")),
    }
}

/// Waits for the helper to connect (or exit), checks it's the process we started, then forwards
/// progress until the pipe closes and the helper exits.
pub(crate) fn serve(pipe: &Handle, process: &Handle, expected_pid: Option<u32>, on_event: impl Fn(AdminEvent)) -> Result<AdminResult, String> {
    let event = Handle(unsafe { CreateEventW(None, true, false, None) }.map_err(|e| e.to_string())?);
    let mut ov = OVERLAPPED { hEvent: event.0, ..Default::default() };
    match unsafe { ConnectNamedPipe(pipe.0, Some(&mut ov)) } {
        Ok(()) => {}
        Err(e) if e.code() == ERROR_PIPE_CONNECTED.to_hresult() => {}
        Err(e) if e.code() == ERROR_IO_PENDING.to_hresult() => {
            let first = unsafe { WaitForMultipleObjects(&[event.0, process.0], false, INFINITE) };
            if first != WAIT_OBJECT_0 {
                // The helper exited without connecting: cancel, and let the I/O finish before `ov` goes away.
                let _ = unsafe { CancelIoEx(pipe.0, Some(&ov)) };
                let mut n = 0;
                let _ = unsafe { GetOverlappedResult(pipe.0, &ov, &mut n, true) };
                return Err(exit_message(exit_code(process)));
            }
            let mut n = 0;
            unsafe { GetOverlappedResult(pipe.0, &ov, &mut n, false) }.map_err(|e| format!("The admin helper couldn't connect: {e}"))?;
        }
        Err(e) => return Err(format!("The admin helper couldn't connect: {e}")),
    }
    if let Some(pid) = expected_pid {
        let mut client = 0u32;
        if unsafe { GetNamedPipeClientProcessId(pipe.0, &mut client) }.is_err() || client != pid {
            return Err("An unexpected program connected to Lagsmith's admin pipe, so the task was stopped".into());
        }
    }

    let mut result = None;
    let mut pending: Vec<u8> = Vec::new();
    let mut total = 0usize;
    let mut buf = vec![0u8; 16 * 1024];
    loop {
        let mut ov = OVERLAPPED { hEvent: event.0, ..Default::default() };
        let mut n = 0u32;
        let r = unsafe { ReadFile(pipe.0, Some(&mut buf), None, Some(&mut ov)) };
        let r = match r {
            Err(e) if e.code() == ERROR_IO_PENDING.to_hresult() => unsafe { GetOverlappedResult(pipe.0, &ov, &mut n, true) },
            Ok(()) => unsafe { GetOverlappedResult(pipe.0, &ov, &mut n, true) },
            Err(e) => Err(e),
        };
        match r {
            Ok(()) => {}
            Err(e) if e.code() == ERROR_BROKEN_PIPE.to_hresult() => break, // helper closed its end
            Err(e) => return Err(format!("Lost contact with the admin helper: {e}")),
        }
        total += n as usize;
        if total > MAX_OUTPUT {
            return Err("The admin helper sent too much data".into());
        }
        pending.extend_from_slice(&buf[..n as usize]);
        while let Some(i) = pending.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = pending.drain(..=i).collect();
            match serde_json::from_slice::<HelperMessage>(&line) {
                Ok(HelperMessage::Progress(p)) => on_event(p),
                Ok(HelperMessage::Done(r)) => result = Some(r),
                Err(_) => {} // ignore anything that isn't one of our messages
            }
        }
    }
    unsafe { WaitForSingleObject(process.0, INFINITE) };
    result.ok_or_else(|| exit_message(exit_code(process)))
}

fn exit_code(process: &Handle) -> Option<u32> {
    let mut code = 0u32;
    unsafe { GetExitCodeProcess(process.0, &mut code) }.ok().map(|()| code)
}

pub(crate) fn exit_message(code: Option<u32>) -> String {
    match code {
        Some(EXIT_BAD_ARGS) => "The admin helper refused its arguments".into(),
        Some(EXIT_GAME_RUNNING) => protected::GATE_MESSAGE.into(),
        Some(EXIT_PIPE_REFUSED) => "The admin helper couldn't confirm it was started by Lagsmith, so it stopped".into(),
        Some(EXIT_SYSTEM_DLL) => "A Windows component the helper needs (dbgeng.dll or srclient.dll) is missing".into(),
        Some(c) => format!("The admin helper stopped unexpectedly (code {c})"),
        None => "The admin helper stopped unexpectedly".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_GENERIC_WRITE, FILE_SHARE_NONE, OPEN_EXISTING, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT, WriteFile};
    use windows::Win32::System::Threading::SetEvent;

    /// A manual-reset event stands in for the helper's process handle.
    fn fake_process(exited: bool) -> Handle {
        let h = Handle(unsafe { CreateEventW(None, true, false, None) }.expect("event"));
        if exited {
            unsafe { SetEvent(h.0) }.expect("set");
        }
        h
    }

    #[test]
    fn pipe_name_is_valid_and_single_instance() {
        let (name, _pipe) = create_pipe().expect("pipe");
        assert!(protocol::valid_pipe_name(&name), "{name}");
        // FILE_FLAG_FIRST_PIPE_INSTANCE: nobody can create a second instance under that name.
        let w = wide(&name);
        let second = unsafe {
            CreateNamedPipeW(PCWSTR(w.as_ptr()), PIPE_ACCESS_INBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_TYPE_BYTE, 1, 0, 0, 0, None)
        };
        assert!(second.is_invalid());
    }

    #[test]
    fn forwards_progress_and_returns_result() {
        let (name, pipe) = create_pipe().expect("pipe");
        let process = fake_process(false);
        let client = std::thread::spawn(move || {
            let w = wide(&name);
            let h = loop {
                let r = unsafe {
                    CreateFileW(PCWSTR(w.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_NONE, None, OPEN_EXISTING, SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION, None)
                };
                if let Ok(h) = r {
                    break Handle(h);
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            };
            let lines = concat!(
                "{\"type\":\"progress\",\"stage\":\"Verification 45% complete\",\"percent\":45.0}\n",
                "not json\n",
                "{\"type\":\"done\",\"task\":\"sfc\",\"ok\":true,\"outcome\":\"no_problems\",\"message\":\"Fine\",\"exitCode\":0,\"dumps\":[]}\n"
            );
            // Split mid-line to check the reader reassembles it.
            let (a, b) = lines.split_at(30);
            for part in [a, b] {
                unsafe { WriteFile(h.0, Some(part.as_bytes()), None, None) }.expect("write");
            }
        });
        // The fake process "exits" once the client is done, as the helper would.
        let events = std::sync::Mutex::new(Vec::new());
        let done = std::thread::spawn({
            let p = process.0.0 as isize;
            move || {
                let _ = client.join();
                unsafe { SetEvent(HANDLE(p as _)) }.expect("set");
            }
        });
        let r = serve(&pipe, &process, None, |e| events.lock().expect("lock").push(e)).expect("result");
        let _ = done.join();
        assert_eq!(r.outcome, "no_problems");
        assert_eq!(events.into_inner().expect("lock"), vec![AdminEvent { stage: "Verification 45% complete".into(), percent: Some(45.0) }]);
    }

    #[test]
    fn helper_that_exits_without_connecting_is_an_error_not_a_hang() {
        let (_name, pipe) = create_pipe().expect("pipe");
        let process = fake_process(true);
        let err = serve(&pipe, &process, None, |_| {}).expect_err("no helper");
        assert!(err.contains("stopped unexpectedly"), "{err}");
    }

    #[test]
    fn exit_codes_map_to_plain_english() {
        assert_eq!(exit_message(Some(EXIT_GAME_RUNNING)), protected::GATE_MESSAGE);
        assert!(exit_message(Some(EXIT_BAD_ARGS)).contains("refused"));
        assert!(exit_message(Some(EXIT_PIPE_REFUSED)).contains("confirm"));
        assert!(exit_message(Some(EXIT_SYSTEM_DLL)).contains("dbgeng.dll"));
        assert!(exit_message(Some(1)).contains("code 1"));
    }

    #[test]
    fn closed_pipe_without_a_result_is_an_error_not_a_hang() {
        let (name, pipe) = create_pipe().expect("pipe");
        let process = fake_process(false);
        let client = std::thread::spawn(move || {
            let w = wide(&name);
            let h = loop {
                let r = unsafe {
                    CreateFileW(PCWSTR(w.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_NONE, None, OPEN_EXISTING, SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION, None)
                };
                if let Ok(h) = r {
                    break Handle(h);
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            };
            let line = "{\"type\":\"progress\",\"stage\":\"Verification 84% complete\",\"percent\":84.0}
";
            unsafe { WriteFile(h.0, Some(line.as_bytes()), None, None) }.expect("write");
            // helper dies here: the pipe handle closes, then the process handle signals
        });
        let done = std::thread::spawn({
            let p = process.0.0 as isize;
            move || {
                let _ = client.join();
                unsafe { SetEvent(HANDLE(p as _)) }.expect("set");
            }
        });
        let err = serve(&pipe, &process, None, |_| {}).expect_err("no result");
        let _ = done.join();
        assert!(err.contains("stopped unexpectedly"), "{err}");
    }

    #[test]
    fn busy_guard_names_the_running_task_and_always_releases() {
        assert_eq!(running_task(), None);
        let guard = Busy::acquire("sfc").expect("free");
        assert_eq!(running_task(), Some("SFC"));
        let err = Busy::acquire("dism-restorehealth").err().expect("busy");
        assert!(err.starts_with("SFC is still running"), "{err}");
        assert!(err.contains("System Repair"), "{err}");
        drop(guard);
        assert_eq!(running_task(), None);
        // released on an early error return too
        let r: Result<(), String> = (|| {
            let _b = Busy::acquire("dism-restorehealth")?;
            Err("boom".into())
        })();
        assert!(r.is_err());
        drop(Busy::acquire("restore-point").expect("free again"));
    }

    #[test]
    fn rejects_unknown_tasks_before_anything_else() {
        for t in ["", "sfc /scannow", "cmd", r"..\lagsmith-helper.exe", "SFC"] {
            assert_eq!(run_admin_task(t, |_| {}).expect_err(t), "Unknown admin task");
        }
    }
}
