fn companion_name(app_id: &str) -> Result<&'static str, String> {
    match app_id {
        "storybook" => Ok("kaampi Write"),
        "comicbook" => Ok("kaampi Comic"),
        _ => Err("Unknown companion app.".into()),
    }
}

/// Only fixed sibling identifiers are accepted; no paths or commands come from the UI.
#[tauri::command(async)]
pub fn open_companion_app(app_id: String) -> Result<(), String> {
    let name = companion_name(&app_id)?;
    open_installed(name)
}

#[cfg(target_os = "windows")]
fn open_installed(name: &str) -> Result<(), String> {
    use std::{os::windows::process::CommandExt, process::Command};
    use std::ffi::c_void;
    #[link(name = "user32")]
    unsafe extern "system" {
        fn FindWindowW(class: *const u16, title: *const u16) -> *mut c_void;
        fn IsIconic(window: *mut c_void) -> i32;
        fn ShowWindow(window: *mut c_void, command: i32) -> i32;
        fn SetForegroundWindow(window: *mut c_void) -> i32;
    }
    let title: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    // The siblings' main windows use their product names as titles.
    unsafe {
        let window = FindWindowW(std::ptr::null(), title.as_ptr());
        if !window.is_null() {
            if IsIconic(window) != 0 { ShowWindow(window, 9); }
            if SetForegroundWindow(window) != 0 { return Ok(()); }
            return Err(format!("Could not bring {name} to the foreground. Select it from the taskbar."));
        }
    }
    // Start menu registration also covers installations in a custom directory.
    // `name` is from companion_name, never from a user-supplied command string.
    let script = format!("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $companion = Get-StartApps | Where-Object {{ $_.Name -eq '{name}' }} | Select-Object -First 1; if ($null -eq $companion) {{ exit 2 }}; [Console]::Write($companion.AppID)");
    let system_root = std::env::var_os("SystemRoot").ok_or("Windows directory is unavailable.")?;
    let powershell = std::path::PathBuf::from(&system_root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let result = Command::new(powershell)
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x08000000)
        .output().map_err(|_| format!("Could not find the installed {name}."))?;
    let app_id = String::from_utf8(result.stdout).map_err(|_| "Invalid app registration.".to_string())?;
    let app_id = app_id.trim();
    if !result.status.success() || app_id.is_empty() || app_id.contains(['\r', '\n']) {
        return Err(format!("{name} is not registered in the Windows Start menu. Install the desktop app first."));
    }
    Command::new(std::path::PathBuf::from(system_root).join("explorer.exe"))
        .arg(format!("shell:AppsFolder\\{app_id}"))
        .spawn().map_err(|_| format!("Could not open {name}."))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_installed(_name: &str) -> Result<(), String> {
    Err("Opening installed companion apps is currently available on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_known_companions_can_be_launched() {
        assert_eq!(companion_name("storybook").unwrap(), "kaampi Write");
        assert_eq!(companion_name("comicbook").unwrap(), "kaampi Comic");
        for input in ["", "sandbox", "cmd.exe", "storybook; calc", "../../evil"] {
            assert!(companion_name(input).is_err());
        }
    }
}
