#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod core_bridge;
mod companion_apps;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(core_bridge::PairingState::default())
        .invoke_handler(tauri::generate_handler![
            companion_apps::open_companion_app,
            core_bridge::core_begin,
            core_bridge::core_poll,
            core_bridge::core_connection,
            core_bridge::core_disconnect,
            core_bridge::core_read
        ])
        .run(tauri::generate_context!())
        .expect("Could not start kaampi Explore");
}
