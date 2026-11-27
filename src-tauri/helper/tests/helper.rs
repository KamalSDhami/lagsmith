//! Integration tests for lagsmith-helper exit codes. Never triggers UAC.

use std::process::Command;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_INBOUND};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows::core::PCWSTR;

const HELPER: &str = env!("CARGO_BIN_EXE_lagsmith-helper");
const VALID_PIPE: &str = r"\\.\pipe\lagsmith-0123456789abcdef0123456789abcdef";

#[test]
fn bad_args_exit_2() {
    let cases: &[&[&str]] = &[
        &[],
        &["sfc"],
        &["sfc", VALID_PIPE, "extra"],
        &["unknown-action", VALID_PIPE],
        &["SFC", VALID_PIPE],
        &["sfc", r"\\.\pipe\not-lagsmith"],
        &["sfc", r"\\.\pipe\lagsmith-0123456789ABCDEF0123456789ABCDEF"],
    ];
    for args in cases {
        let status = Command::new(HELPER).args(*args).status().expect("spawn helper");
        assert_eq!(status.code(), Some(2), "expected exit 2 for {args:?}");
    }
}

#[test]
fn missing_pipe_exits_4() {
    let status = Command::new(HELPER).args(["sfc", VALID_PIPE]).status().expect("spawn helper");
    assert_eq!(status.code(), Some(4));
}

#[test]
fn wrong_pipe_server_exits_4() {
    // Use a unique pipe name so concurrent test runs never collide.
    let pid = std::process::id();
    let pipe_name = format!(r"\\.\pipe\lagsmith-{pid:032x}");
    let wide: Vec<u16> = pipe_name.encode_utf16().chain(std::iter::once(0)).collect();
    let pipe = unsafe {
        CreateNamedPipeW(
            PCWSTR(wide.as_ptr()),
            PIPE_ACCESS_INBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            0,
            4096,
            0,
            None,
        )
    };
    assert!(!pipe.is_invalid(), "CreateNamedPipeW failed");
    let raw = pipe.0 as isize;
    let server = std::thread::spawn(move || {
        let h = windows::Win32::Foundation::HANDLE(raw as _);
        let _ = unsafe { ConnectNamedPipe(h, None) };
        let _ = unsafe { CloseHandle(h) };
    });

    let status = Command::new(HELPER).args(["sfc", &pipe_name]).status().expect("spawn helper");
    let _ = server.join();
    assert_eq!(status.code(), Some(4), "helper must reject non-lagsmith.exe pipe server");
}
