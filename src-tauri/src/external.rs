//! open_external: the only way the UI opens a link. Exact hosts and shapes, never a free-form URL.

/// https hosts the UI may open. Verified 27 Nov 2026: the older support-valorant and
/// support-leagueoflegends hosts redirect to support.riotgames.com.
const HTTPS_HOSTS: &[&str] = &["support.riotgames.com", "learn.microsoft.com", "apps.microsoft.com"];
const PROJECT_PATH: &str = "/KamalSDhami/lagsmith";
const MAX_LEN: usize = 512;

pub fn validate(url: &str) -> Result<(), String> {
    let bad = || Err("Lagsmith can't open that link".to_string());
    if url.len() > MAX_LEN || !url.bytes().all(|b| b.is_ascii_alphanumeric() || b"-._~:/?=&%#+,".contains(&b)) {
        return bad();
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("..") || lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c") || lower.contains("%00") {
        return bad();
    }
    if url == "ms-settings:appsfeatures" {
        return Ok(());
    }
    // The Store link the Review sheet uses to reinstall a removed app: a package family name only.
    if let Some(pfn) = url.strip_prefix("ms-windows-store://pdp/?PFN=") {
        let ok = !pfn.is_empty() && pfn.len() <= 128 && pfn.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-');
        return if ok { Ok(()) } else { bad() };
    }
    let Some(rest) = url.strip_prefix("https://") else { return bad() };
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (host, tail) = rest.split_at(host_end);
    if HTTPS_HOSTS.contains(&host) {
        return Ok(());
    }
    if host == "github.com" && tail.strip_prefix(PROJECT_PATH).is_some_and(|t| t.is_empty() || t.starts_with(['/', '?', '#'])) {
        return Ok(());
    }
    bad()
}

pub fn open(url: &str) -> Result<(), String> {
    validate(url)?;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::PCWSTR;
    let (verb, file) = (crate::scan::wide("open"), crate::scan::wide(url));
    // Returns a value above 32 on success (legacy HINSTANCE convention).
    let r = unsafe { ShellExecuteW(None, PCWSTR(verb.as_ptr()), PCWSTR(file.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    if r.0 as usize > 32 { Ok(()) } else { Err("Windows couldn't open that link".into()) }
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn allows_only_listed_links() {
        for ok in [
            "https://support.riotgames.com/valorant",
            "https://support.riotgames.com",
            "https://learn.microsoft.com/en-us/windows/win32/",
            "https://apps.microsoft.com/detail/9nblggh4nns1",
            "https://github.com/KamalSDhami/lagsmith",
            "https://github.com/KamalSDhami/lagsmith/",
            "https://github.com/KamalSDhami/lagsmith/issues?q=a#x",
            "ms-windows-store://pdp/?PFN=Microsoft.XboxApp_8wekyb3d8bbwe",
            "ms-settings:appsfeatures",
        ] {
            assert!(validate(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn rejects_everything_else() {
        for bad in [
            "",
            "http://support.riotgames.com/",
            "https://support.riotgames.com.evil.com/",
            "https://evil.com/support.riotgames.com",
            "https://support.riotgames.com@evil.com/",
            "https://evil.com@support.riotgames.com/",
            "https://support.riotgames.com:8443/",
            "https://support.riotgames.com\\@evil.com",
            "https://github.com/KamalSDhami/lagsmith-evil",
            "https://github.com/KamalSDhami/other",
            "https://github.com/KamalSDhami/lagsmith/../../x",
            "https://github.com/KamalSDhami/lagsmith/%2e%2e/x",
            "https://learn.microsoft.com/a b",
            "https://learn.microsoft.com/\n",
            "file:///C:/Windows/System32/cmd.exe",
            "javascript:alert(1)",
            "ms-settings:privacy",
            "ms-windows-store://pdp/?PFN=",
            "ms-windows-store://pdp/?PFN=a&b=c",
            "ms-windows-store://pdp/?PFN=a/../b",
            "cmd.exe",
            "https://",
        ] {
            assert!(validate(bad).is_err(), "{bad:?}");
        }
        assert!(validate(&format!("https://learn.microsoft.com/{}", "a".repeat(600))).is_err());
    }
}
