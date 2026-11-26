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
    let events: Vec<Event> = query_events()?.into_iter().filter(|e| e.local_day >= first && e.local_day <= today).collect();

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
    for e in &events {
        match e.id {
            1001 => {
                let code = data(e, "param1").and_then(parse_bugcheck);
                days[(e.local_day - first) as usize].blue_screens += 1;
                bsod_secs.push(e.utc_secs);
                crashes.push(Crash {
                    time: e.time.clone(),
                    code: code.map_or_else(|| "unknown".into(), |c| format!("0x{c:08X}")),
                    meaning: code.map_or("", meaning).into(),
                    dump_file: data(e, "param2").filter(|p| !p.is_empty()).map(str::to_string),
                });
            }
            41 | 6008 => {
                let bugcheck = e.id == 41 && data(e, "BugcheckCode").is_some_and(|c| c.trim() != "0");
                shutdowns.push(Shutdown { secs: e.utc_secs, day: e.local_day, bugcheck });
            }
            4101 => driver_resets += 1,
            _ => {}
        }
    }
    for day in incidents(shutdowns, &bsod_secs) {
        days[(day - first) as usize].unexpected_shutdowns += 1;
    }
    crashes.sort_by(|a, b| b.time.cmp(&a.time));
    Ok(Stability { days, crashes, driver_resets })
}

#[derive(Clone, Copy)]
struct Shutdown {
    secs: i64,
    day: i64,
    bugcheck: bool,
}

/// Merges 41/6008 events that are minutes apart into one incident, and drops incidents that
/// were really a blue screen (41 carries a bugcheck code, or a 1001 was logged alongside),
/// since those are already counted as blue screens. Returns the local day of each incident.
fn incidents(mut events: Vec<Shutdown>, bsod_secs: &[i64]) -> Vec<i64> {
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
            let near_bsod = bsod_secs.iter().any(|&b| b >= start - INCIDENT_WINDOW_SECS && b <= end + INCIDENT_WINDOW_SECS);
            !near_bsod && !g.iter().any(|e| e.bugcheck)
        })
        .map(|g| g[0].day)
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

fn query_events() -> Result<Vec<Event>, String> {
    // Providers are filtered too, so another source reusing an ID isn't miscounted.
    // 31 days back covers the oldest local day in any time zone; exact bucketing happens later.
    let query = wide(&format!(
        "*[System[(\
         (Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=41) or \
         (Provider[@Name='EventLog'] and EventID=6008) or \
         (Provider[@Name='Microsoft-Windows-WER-SystemErrorReporting'] and EventID=1001) or \
         (Provider[@Name='Display'] and EventID=4101)) and \
         TimeCreated[timediff(@SystemTime) <= {}]]]",
        (DAYS + 1) * 86_400_000
    ));
    let channel = wide("System");
    let results = unsafe { EvtQuery(None, PCWSTR(channel.as_ptr()), PCWSTR(query.as_ptr()), EvtQueryChannelPath.0) }
        .map_err(|e| format!("Couldn't read the System event log: {e}"))?;

    let mut out = Vec::new();
    let mut err = None;
    loop {
        let mut handles = [0isize; 32];
        let mut returned = 0u32;
        if let Err(e) = unsafe { EvtNext(results, &mut handles, u32::MAX, 0, &mut returned) } {
            if e.code() != ERROR_NO_MORE_ITEMS.to_hresult() {
                err = Some(format!("Couldn't read the System event log: {e}"));
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

    fn sd(secs: i64, day: i64, bugcheck: bool) -> Shutdown {
        Shutdown { secs, day, bugcheck }
    }

    #[test]
    fn shutdown_pairs_count_once() {
        // 41 then 6008 twelve seconds later, a week apart: two incidents.
        let days = incidents(vec![sd(1000, 1, false), sd(1012, 1, false), sd(605_000, 8, false), sd(605_013, 8, false)], &[]);
        assert_eq!(days, vec![1, 8]);
    }

    #[test]
    fn shutdowns_from_blue_screens_are_dropped() {
        // A 41 carrying a bugcheck code is a blue screen, and so is a pair next to a 1001.
        assert!(incidents(vec![sd(1000, 1, true), sd(1011, 1, false)], &[]).is_empty());
        assert!(incidents(vec![sd(1000, 1, false), sd(1011, 1, false)], &[1009]).is_empty());
        // A blue screen hours earlier doesn't absorb a later real shutdown.
        assert_eq!(incidents(vec![sd(9000, 2, false), sd(9020, 2, false)], &[0]), vec![2]);
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
