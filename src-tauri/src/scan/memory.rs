use super::utf16_to_string;
use crate::model::*;
use std::collections::HashMap;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{
    GetPerformanceInfo, K32GetProcessMemoryInfo, PERFORMANCE_INFORMATION, PROCESS_MEMORY_COUNTERS_EX2,
};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

pub fn read() -> Result<Memory, String> {
    let mut ms = MEMORYSTATUSEX { dwLength: size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    unsafe { GlobalMemoryStatusEx(&mut ms) }.map_err(|e| format!("Couldn't read memory status: {e}"))?;

    let mut pi = PERFORMANCE_INFORMATION::default();
    unsafe { GetPerformanceInfo(&mut pi, size_of::<PERFORMANCE_INFORMATION>() as u32) }
        .map_err(|e| format!("Couldn't read commit charge: {e}"))?;
    let page = pi.PageSize as u64;

    Ok(Memory {
        total_bytes: ms.ullTotalPhys,
        available_bytes: ms.ullAvailPhys,
        commit_bytes: pi.CommitTotal as u64 * page,
        commit_limit_bytes: pi.CommitLimit as u64 * page,
        top_apps: top_apps()?,
    })
}

fn top_apps() -> Result<Vec<AppMemory>, String> {
    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|e| format!("Couldn't list running processes: {e}"))?;
    let mut groups: HashMap<String, (u32, u64)> = HashMap::new();
    let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut more = unsafe { Process32FirstW(snap, &mut entry) }.is_ok();
    while more {
        let name = utf16_to_string(&entry.szExeFile);
        // Never open a handle to a game or anti-cheat process, even query-only (docs/ANTI-CHEAT.md).
        let bytes = if super::protected::is_protected(&name) { None } else { private_working_set(entry.th32ProcessID) };
        if let Some(bytes) = bytes {
            let g = groups.entry(name).or_default();
            g.0 += 1;
            g.1 += bytes;
        }
        more = unsafe { Process32NextW(snap, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snap) };

    let mut apps: Vec<AppMemory> =
        groups.into_iter().map(|(name, (processes, bytes))| AppMemory { name, processes, bytes }).collect();
    apps.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    apps.truncate(8);
    Ok(apps)
}

fn private_working_set(pid: u32) -> Option<u64> {
    if pid == 0 {
        return None;
    }
    let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    // Private working set is what Task Manager's Memory column shows; shared pages aren't counted twice.
    let mut pmc = PROCESS_MEMORY_COUNTERS_EX2::default();
    let size = size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
    let ok = unsafe { K32GetProcessMemoryInfo(h, (&raw mut pmc).cast(), size) }.as_bool();
    let _ = unsafe { CloseHandle(h) };
    ok.then_some(pmc.PrivateWorkingSetSize as u64)
}
