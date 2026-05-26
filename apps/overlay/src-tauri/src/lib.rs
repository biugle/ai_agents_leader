mod commands;
mod window;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // New instance launched — close all existing windows and exit
            let windows = app.webview_windows();
            for (_, window) in windows {
                let _ = window.close();
            }
            // Exit the old process
            std::process::exit(0);
        }))
        .invoke_handler(tauri::generate_handler![
            commands::create_pod_window,
            commands::set_always_on_top,
            commands::set_click_through,
            commands::ensure_runtime,
            commands::get_ws_port,
        ])
        .setup(|app| {
            // Make main window transparent
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = window.set_always_on_top(true);
                }
            }

            // Auto-start runtime if not running
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match commands::ensure_runtime().await {
                    Ok(already_running) => {
                        if already_running {
                            println!("Runtime already running");
                        } else {
                            println!("Runtime started");
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to start runtime: {}", e);
                    }
                }
                // Notify frontend that runtime is ready
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.emit("runtime-ready", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
