use serde_json::{Value, json};
use std::sync::Mutex;
use tauri::Manager;
const CORE: &str = "http://127.0.0.1:43127";
#[derive(Default)]
pub struct PairingState(Mutex<Option<(String, String)>>);
fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build()
        .into()
}
#[cfg(target_os = "windows")]
fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.kaampi.explore.codex", "sandbox")
        .map_err(|_| "Credential storage unavailable".into())
}
#[cfg(target_os = "windows")]
fn token() -> Result<String, String> {
    credential()?
        .get_password()
        .map_err(|_| "Not connected to Codex".into())
}
#[cfg(not(target_os = "windows"))]
fn token() -> Result<String, String> {
    Err("Desktop pairing currently requires Windows".into())
}
fn identity() -> Result<Value, String> {
    let result: Value = agent()
        .get(&format!("{CORE}/v1/identity"))
        .header("Authorization", format!("Bearer {}", token()?))
        .call()
        .map_err(|_| "Codex is unavailable or the connection was revoked")?
        .body_mut()
        .read_json()
        .map_err(|_| "Invalid Codex response")?;
    if result["app"] != "sandbox" {
        return Err("The credential does not belong to Explore".into());
    }
    Ok(result)
}
#[tauri::command]
pub async fn core_begin(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result: Value = agent()
            .post(&format!("{CORE}/v1/pairing"))
            .send_json(json!({"app":"sandbox"}))
            .map_err(|_| "Codex is unavailable or needs the pairing update")?
            .body_mut()
            .read_json()
            .map_err(|_| "Invalid pairing response")?;
        let id = result["id"]
            .as_str()
            .ok_or("Missing pairing ID")?
            .to_string();
        let secret = result["secret"]
            .as_str()
            .ok_or("Missing pairing proof")?
            .to_string();
        if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) || secret.len() != 64 {
            return Err("Invalid pairing response".into());
        }
        *app.state::<PairingState>()
            .0
            .lock()
            .map_err(|_| "Pairing state unavailable")? = Some((id.clone(), secret));
        Ok(json!({"code":id[id.len()-6..].to_uppercase(),"expiresAt":result["expiresAt"]}))
    })
    .await
    .map_err(|_| "Pairing failed".to_string())?
}
#[tauri::command]
pub async fn core_poll(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<PairingState>();
        let mut attempt = state.0.lock().map_err(|_| "Pairing state unavailable")?;
        let (id, secret) = attempt.as_ref().ok_or("No pending pairing")?;
        let result: Value = agent()
            .post(&format!("{CORE}/v1/pairing/{id}/claim"))
            .send_json(json!({"secret":secret}))
            .map_err(|_| "Pairing expired or Codex is unavailable")?
            .body_mut()
            .read_json()
            .map_err(|_| "Invalid pairing response")?;
        if result["state"] == "connected" {
            let issued = result["token"].as_str().ok_or("Missing credential")?;
            #[cfg(target_os = "windows")]
            credential()?
                .set_password(issued)
                .map_err(|_| "Could not save Codex connection")?;
            #[cfg(not(target_os = "windows"))]
            {
                let _ = issued;
                return Err("Desktop pairing currently requires Windows".into());
            }
            identity()?;
            *attempt = None;
        } else if result["state"] == "denied" {
            *attempt = None;
        }
        Ok(json!({"state":result["state"]}))
    })
    .await
    .map_err(|_| "Pairing failed".to_string())?
}
#[tauri::command]
pub async fn core_connection() -> Value {
    tauri::async_runtime::spawn_blocking(
        || json!({"paired":token().is_ok(),"reachable":identity().is_ok()}),
    )
    .await
    .unwrap_or(json!({"paired":false,"reachable":false}))
}
#[tauri::command]
pub fn core_disconnect(app: tauri::AppHandle) -> Result<(), String> {
    *app.state::<PairingState>()
        .0
        .lock()
        .map_err(|_| "Pairing state unavailable")? = None;
    #[cfg(target_os = "windows")]
    {
        match credential()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not disconnect".into()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}
#[tauri::command]
pub async fn core_read(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let record = path.strip_prefix("/v1/records/");
        if path != "/v1/shared-manuscripts"
            && !record.is_some_and(|id| {
                id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
            })
        {
            return Err("Unsupported Codex read".into());
        }
        agent()
            .get(&format!("{CORE}{path}"))
            .header("Authorization", format!("Bearer {}", token()?))
            .call()
            .map_err(|_| "Could not read shared Codex content")?
            .body_mut()
            .with_config()
            .limit(22_000_000)
            .read_json()
            .map_err(|_| "Invalid Codex response".into())
    })
    .await
    .map_err(|_| "Codex read failed".to_string())?
}
