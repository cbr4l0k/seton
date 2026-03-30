pub mod app_state;
pub mod commands;
pub mod db;
pub mod domain;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = AppState::initialize(app.handle())?;
            app.manage(state);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace::bootstrap_workspace,
            commands::workspace::save_note,
            commands::workspace::open_note,
            commands::workspace::delete_note,
            commands::workspace::search_notes,
            commands::workspace::rename_text_context,
            commands::workspace::export_notes_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
