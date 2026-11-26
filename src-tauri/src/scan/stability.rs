use super::{civil_from_days, days_from_civil, wide};
use crate::model::*;
use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS, SYSTEMTIME};
use windows::Win32::System::EventLog::{
    EVT_HANDLE, EvtClose, EvtNext, EvtQuery, EvtQueryChannelPath, EvtRender, EvtRenderEventXml,
};
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows::Win32::System::Time::SystemTimeToTzSpecificLocalTime;
use windows::core::PCWSTR;

const DAYS: i64 = 30;
// 41 and 6008 from one crash are logged seconds apart at the next boot.
const INCIDENT_WINDOW_SECS: i64 = 10 * 60;

struct Event {
    id: u32,
    utc_secs: i64,
    local_day: i64,
    time: String,
    data: Vec<(String, String)>,
}

pub fn read() -> Result<Stability, String> {
    let today = local_today();
    let first = today - (DAYS - 1);
    let in_range = |e: &Event| e.local_day >= first && e.local_day <= today;
    let events: Vec<Event> = query_events("System", SYSTEM_QUERY)?.into_iter().filter(in_range).collect();

    let mut days: Vec<DayEvents> = (first..=today)
        .map(|d| {
            let (y, m, dd) = civil_from_days(d);
            DayEvents { date: format!("{y:04}-{m:02}-{dd:02}"), blue_screens: 0, unexpected_shutdowns: 0 }
        })
        .collect();

    let mut crashes = Vec::new();
    let mut bsod_secs = Vec::new();
    let mut shutdowns = Vec::new();
    let mut driver_resets = 0;
    for (idx, e) in events.iter().enumerate() {
        match e.id {
            1001 => {
                let code = data(e, "param1").and_then(parse_bugcheck);
                days[(e.local_day - first) as usize].blue_screens += 1;
                bsod_secs.push(e.utc_secs);
                crashes.push(crash(e, code, data(e, "param2").filter(|p| !p.is_empty()).map(str::to_string)));
            }
            41 | 6008 => {
                // Kernel-Power logs BugcheckCode in decimal (206 = 0xCE); 0 means no blue screen.
                let bugcheck = if e.id == 41 { data(e, "BugcheckCode").and_then(|c| c.trim().parse().ok()).filter(|&c| c != 0) } else { None };
                shutdowns.push(Shutdown { secs: e.utc_secs, idx, bugcheck });
            }
            4101 => driver_resets += 1,
            _ => {}
        }
    }
    for incident in incidents(shutdowns, &bsod_secs) {
        match incident {
            Incident::Shutdown(idx) => days[(events[idx].local_day - first) as usize].unexpected_shutdowns += 1,
            Incident::BlueScreen(idx, code) => {
                let e = &events[idx];
                days[(e.local_day - first) as usize].blue_screens += 1;
                crashes.push(crash(e, Some(code), None));
            }
        }
    }
    crashes.sort_by(|a, b| b.time.cmp(&a.time));
    let mut app_crashes: Vec<AppCrash> =
        query_events("Application", APP_QUERY)?.iter().filter(|e| in_range(e)).filter_map(app_crash).collect();
    app_crashes.sort_by(|a, b| b.time.cmp(&a.time));
    app_crashes.truncate(50);
    Ok(Stability { days, crashes, driver_resets, app_crashes })
}

/// 1000 names the faulting module; 1002 (hang) has none. Older logs use unnamed param1..param4.
fn app_crash(e: &Event) -> Option<AppCrash> {
    let get = |name: &str, fallback: &str| data(e, name).or_else(|| data(e, fallback)).unwrap_or("").trim().to_string();
    let app = get("AppName", "param1");
    if app.is_empty() {
        return None;
    }
    let hang = e.id == 1002;
    let module = if hang { String::new() } else { get("ModuleName", "param4") };
    Some(AppCrash { time: e.time.clone(), app, module, hang })
}

fn crash(e: &Event, code: Option<u32>, dump_file: Option<String>) -> Crash {
    Crash {
        time: e.time.clone(),
        code: code.map_or_else(|| "unknown".into(), |c| format!("0x{c:08X}")),
        meaning: code.map_or("", meaning).into(),
        dump_file,
    }
}

#[derive(Clone, Copy)]
struct Shutdown {
    secs: i64,
    idx: usize, // into the event list
    bugcheck: Option<u32>,
}

#[derive(Debug, PartialEq)]
enum Incident {
    Shutdown(usize),
    /// A 41 with a bugcheck code but no 1001 (the dump wasn't written): still a blue screen.
    BlueScreen(usize, u32),
}

/// Merges 41/6008 events that are minutes apart into one incident. Incidents next to a 1001 are
/// dropped, since that blue screen is already counted. Values are indexes of each incident's first event.
fn incidents(mut events: Vec<Shutdown>, bsod_secs: &[i64]) -> Vec<Incident> {
    events.sort_by_key(|e| e.secs);
    let mut groups: Vec<Vec<Shutdown>> = Vec::new();
    for e in events {
        match groups.last_mut() {
            Some(g) if g.last().is_some_and(|l| e.secs - l.secs <= INCIDENT_WINDOW_SECS) => g.push(e),
            _ => groups.push(vec![e]),
        }
    }
    groups
        .into_iter()
        .filter(|g| {
            let (start, end) = (g[0].secs, g[g.len() - 1].secs);
            !bsod_secs.iter().any(|&b| b >= start - INCIDENT_WINDOW_SECS && b <= end + INCIDENT_WINDOW_SECS)
        })
        .map(|g| match g.iter().find_map(|e| e.bugcheck.map(|c| (e.idx, c))) {
            Some((idx, code)) => Incident::BlueScreen(idx, code),
            None => Incident::Shutdown(g[0].idx),
        })
        .collect()
}

/// "0x000000ce (0xfffff807..., ...)" -> 0xCE
fn parse_bugcheck(param1: &str) -> Option<u32> {
    let s = param1.trim();
    let hex = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"))?;
    let end = hex.find(|c: char| !c.is_ascii_hexdigit()).unwrap_or(hex.len());
    u64::from_str_radix(&hex[..end], 16).ok().map(|v| v as u32)
}

fn meaning(code: u32) -> &'static str {
    match code {
        0xCE => "A driver was unloaded while it still had work pending",
        0x50 => "Something read memory that doesn't exist (often a driver or faulty RAM)",
        0xD1 => "A driver accessed memory it shouldn't, at too high a priority",
        0x116 => "The graphics driver stopped responding and couldn't be reset",
        0x133 => "A driver or the system hung for too long (DPC watchdog)",
        0x1E => "A kernel component hit an unexpected error",
        0x3B => "A system service hit an unexpected error",
        0x9F => "A driver mishandled a power state change",
        0x7E => "A system thread hit an unexpected error",
        0xEF => "A critical Windows process stopped",
        _ => "",
    }
}

fn data<'a>(e: &'a Event, name: &str) -> Option<&'a str> {
    e.data.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
}

fn local_today() -> i64 {
    let now = unsafe { GetLocalTime() };
    days_from_civil(now.wYear as i64, now.wMonth as u32, now.wDay as u32)
}

// Providers are filtered too, so another source reusing an ID isn't miscounted.
// 31 days back covers the oldest local day in any time zone; exact bucketing happens later.
const SYSTEM_QUERY: &str = "(Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=41) or \
     (Provider[@Name='EventLog'] and EventID=6008) or \
     (Provider[@Name='Microsoft-Windows-WER-SystemErrorReporting'] and EventID=1001) or \
     (Provider[@Name='Display'] and EventID=4101)";
const APP_QUERY: &str = "(Provider[@Name='Application Error'] and EventID=1000) or \
     (Provider[@Name='Application Hang'] and EventID=1002)";

fn query_events(channel: &str, filter: &str) -> Result<Vec<Event>, String> {
    let query = wide(&format!("*[System[({filter}) and TimeCreated[timediff(@SystemTime) <= {}]]]", (DAYS + 1) * 86_400_000));
    let channel_w = wide(channel);
    let fail = |e: windows::core::Error| format!("Couldn't read the {channel} event log: {e}");
    let results = unsafe { EvtQuery(None, PCWSTR(channel_w.as_ptr()), PCWSTR(query.as_ptr()), EvtQueryChannelPath.0) }.map_err(fail)?;

    let mut out = Vec::new();
    let mut err = None;
    loop {
        let mut handles = [0isize; 32];
        let mut returned = 0u32;
        if let Err(e) = unsafe { EvtNext(results, &mut handles, u32::MAX, 0, &mut returned) } {
            if e.code() != ERROR_NO_MORE_ITEMS.to_hresult() {
                err = Some(fail(e));
            }
            break;
        }
        for &h in &handles[..returned as usize] {
            let h = EVT_HANDLE(h);
            if let Some(ev) = render_xml(h).and_then(|xml| parse_event(&xml)) {
                out.push(ev);
            }
            let _ = unsafe { EvtClose(h) };
        }
    }
    let _ = unsafe { EvtClose(results) };
    match err {
        Some(e) => Err(e),
        None => Ok(out),
    }
}

fn render_xml(h: EVT_HANDLE) -> Option<String> {
    let (mut used, mut props) = (0u32, 0u32);
    if let Err(e) = unsafe { EvtRender(None, h, EvtRenderEventXml.0, 0, None, &mut used, &mut props) }
        && e.code() != ERROR_INSUFFICIENT_BUFFER.to_hresult()
    {
        return None;
    }
    let mut buf = vec![0u16; (used as usize).div_ceil(2)];
    unsafe { EvtRender(None, h, EvtRenderEventXml.0, used, Some(buf.as_mut_ptr().cast()), &mut used, &mut props) }.ok()?;
    Some(super::utf16_to_string(&buf))
}

fn parse_event(xml: &str) -> Option<Event> {
    let id_start = xml.find("<EventID")?;
    let id_text = between(&xml[id_start..], ">", "<")?;
    let id = id_text.trim().parse().ok()?;
    let stamp = attr(xml, "SystemTime")?;
    let (utc_secs, local_day) = parse_time(stamp)?;
    // Trim to whole seconds: "2026-11-25T15:57:56.5428564Z" -> "2026-11-25T15:57:56Z".
    let time = format!("{}Z", stamp.get(..19)?);

    let mut data = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find("<Data Name=") {
        rest = &rest[i + 11..];
        let q = rest.chars().next().filter(|c| *c == '\'' || *c == '"')?;
        let name_end = rest[1..].find(q)? + 1;
        let name = rest[1..name_end].to_string();
        rest = &rest[name_end + 1..];
        let value = if rest.starts_with("/>") {
            String::new()
        } else {
            unescape(between(rest, ">", "</Data>")?)
        };
        data.push((name, value));
    }
    Some(Event { id, utc_secs, local_day, time, data })
}

fn between<'a>(s: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let a = s.find(open)? + open.len();
    let b = s[a..].find(close)? + a;
    Some(&s[a..b])
}

fn attr<'a>(xml: &'a str, name: &str) -> Option<&'a str> {
    let i = xml.find(&format!("{name}="))? + name.len() + 1;
    let q = xml[i..].chars().next()?;
    between(&xml[i..], &q.to_string(), &q.to_string())
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/// "2026-11-25T15:57:56.5428564Z" -> (UTC seconds since 1970, local day number)
fn parse_time(s: &str) -> Option<(i64, i64)> {
    let n = |r: std::ops::Range<usize>| s.get(r)?.parse::<u16>().ok();
    let utc = SYSTEMTIME {
        wYear: n(0..4)?,
        wMonth: n(5..7)?,
        wDay: n(8..10)?,
        wHour: n(11..13)?,
        wMinute: n(14..16)?,
        wSecond: n(17..19)?,
        ..Default::default()
    };
    let secs = days_from_civil(utc.wYear as i64, utc.wMonth as u32, utc.wDay as u32) * 86_400
        + utc.wHour as i64 * 3600
        + utc.wMinute as i64 * 60
        + utc.wSecond as i64;
    let mut local = SYSTEMTIME::default();
    unsafe { SystemTimeToTzSpecificLocalTime(None, &utc, &mut local) }.ok()?;
    Some((secs, days_from_civil(local.wYear as i64, local.wMonth as u32, local.wDay as u32)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bugcheck_code_and_meaning() {
        assert_eq!(parse_bugcheck("0x000000ce (0xfffff8078e6cd9bd, 0x0000000000000010)"), Some(0xCE));
        assert_eq!(parse_bugcheck("0x00000050 (0xffff948105a5a3a0, 0x0, 0x0, 0x6)"), Some(0x50));
        assert_eq!(parse_bugcheck("0x00000116"), Some(0x116));
        assert_eq!(parse_bugcheck("garbage"), None);
        assert_eq!(format!("0x{:08X}", 0xCEu32), "0x000000CE");
        assert_eq!(meaning(0x50), "Something read memory that doesn't exist (often a driver or faulty RAM)");
        assert_eq!(meaning(0x1234), "");
    }

    fn sd(secs: i64, idx: usize, bugcheck: Option<u32>) -> Shutdown {
        Shutdown { secs, idx, bugcheck }
    }

    #[test]
    fn shutdown_pairs_count_once() {
        // 41 then 6008 twelve seconds later, a week apart: two incidents.
        let got = incidents(vec![sd(1000, 0, None), sd(1012, 1, None), sd(605_000, 2, None), sd(605_013, 3, None)], &[]);
        assert_eq!(got, vec![Incident::Shutdown(0), Incident::Shutdown(2)]);
    }

    #[test]
    fn shutdowns_next_to_a_1001_are_dropped() {
        // The 1001 already counts this blue screen, with or without a bugcheck on the 41.
        assert!(incidents(vec![sd(1000, 0, Some(0x50)), sd(1011, 1, None)], &[1009]).is_empty());
        assert!(incidents(vec![sd(1000, 0, None), sd(1011, 1, None)], &[1009]).is_empty());
        // A blue screen hours earlier doesn't absorb a later real shutdown.
        assert_eq!(incidents(vec![sd(9000, 0, None), sd(9020, 1, None)], &[0]), vec![Incident::Shutdown(0)]);
    }

    #[test]
    fn bugcheck_41_without_1001_is_a_blue_screen() {
        // 6008 first, then the 41 carrying BugcheckCode 206 (0xCE): one blue screen from the 41.
        assert_eq!(incidents(vec![sd(1011, 1, None), sd(1000, 0, Some(206))], &[]), vec![Incident::BlueScreen(0, 206)]);
        assert_eq!(meaning(206), meaning(0xCE));
    }

    #[test]
    fn app_crash_and_hang_parsing() {
        let xml = |id: u32, data: &str| format!("<Event><System><EventID>{id}</EventID><TimeCreated SystemTime='2026-11-23T19:10:37.1Z'/></System><EventData>{data}</EventData></Event>");
        let c = app_crash(&parse_event(&xml(1000, "<Data Name='AppName'>kapy_notes.exe</Data><Data Name='ModuleName'>flutter_windows.dll</Data>")).expect("xml")).expect("crash");
        assert_eq!((c.app.as_str(), c.module.as_str(), c.hang), ("kapy_notes.exe", "flutter_windows.dll", false));
        let h = app_crash(&parse_event(&xml(1002, "<Data Name='AppName'>adb.exe</Data><Data Name='ModuleName'>x.dll</Data>")).expect("xml")).expect("hang");
        assert_eq!((h.app.as_str(), h.module.as_str(), h.hang), ("adb.exe", "", true));
        let old = app_crash(&parse_event(&xml(1000, "<Data Name='param1'>vgm.exe</Data><Data Name='param4'>unknown</Data>")).expect("xml")).expect("old format");
        assert_eq!((old.app.as_str(), old.module.as_str()), ("vgm.exe", "unknown"));
        assert!(app_crash(&parse_event(&xml(1000, "")).expect("xml")).is_none());
    }

    #[test]
    fn parses_event_xml() {
        let xml = "<Event><System><Provider Name='Microsoft-Windows-WER-SystemErrorReporting'/><EventID Qualifiers='16384'>1001</EventID>\
                   <TimeCreated SystemTime='2026-11-25T15:57:56.5428564Z'/></System><EventData>\
                   <Data Name='param1'>0x000000ce (0x1, 0x2)</Data><Data Name='param2'>C:\\WINDOWS\\Minidump\\a.dmp</Data><Data Name='x'/></EventData></Event>";
        let e = parse_event(xml).expect("parsed");
        assert_eq!(e.id, 1001);
        assert_eq!(e.time, "2026-11-25T15:57:56Z");
        assert_eq!(data(&e, "param1"), Some("0x000000ce (0x1, 0x2)"));
        assert_eq!(data(&e, "param2"), Some("C:\\WINDOWS\\Minidump\\a.dmp"));
        assert_eq!(data(&e, "x"), Some(""));
    }
}
