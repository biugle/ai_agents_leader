use tauri::Manager;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const DISCOVERABLE_API_PORTS: [u16; 5] = [9989, 9990, 9991, 9992, 9993];

fn find_workspace_root(start: &Path) -> Option<PathBuf> {
    for candidate in start.ancestors() {
        if candidate.join("pnpm-workspace.yaml").exists() && candidate.join("apps/overlay").exists() {
            return Some(candidate.to_path_buf());
        }
    }

    None
}

async fn runtime_healthcheck(port: u16) -> bool {
    let address = format!("127.0.0.1:{}", port);
    let mut stream = match TcpStream::connect(address).await {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        port
    );

    if stream.write_all(request.as_bytes()).await.is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).await.is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

/// Create a new floating pod window at the specified position.
#[tauri::command]
pub fn create_pod_window(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let _window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("Signal Pod")
        .inner_size(240.0, 120.0)
        .position(x, y)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set always-on-top for a specific window.
#[tauri::command]
pub fn set_always_on_top(label: String, enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Set click-through mode for a window.
#[tauri::command]
pub fn set_click_through(label: String, enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Check if the runtime is running and start it if not.
/// Returns true if runtime was already running, false if it was started.
#[tauri::command]
pub async fn ensure_runtime() -> Result<bool, String> {
    for port in DISCOVERABLE_API_PORTS {
        if runtime_healthcheck(port).await {
            return Ok(true);
        }
    }

    // Try to find and start the runtime
    // Look for `aal` command first, then fall back to pnpm
    let aal_check = std::process::Command::new("which")
        .arg("aal")
        .output()
        .map_err(|e| e.to_string())?;

    if !aal_check.stdout.is_empty() {
        std::process::Command::new("aal")
            .arg("runtime")
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        // Try pnpm runtime in the nearest workspace directory
        let project_dir = std::env::current_dir()
            .ok()
            .and_then(|dir| find_workspace_root(&dir))
            .or_else(|| std::env::current_exe().ok().and_then(|exe| find_workspace_root(&exe)))
            .or_else(|| {
                dirs::home_dir().and_then(|home| {
                    let candidate = home.join("WorkSpace/AI_Agents_Leader");
                    if candidate.exists() { Some(candidate) } else { None }
                })
            })
            .ok_or("Runtime workspace not found")?;

        if project_dir.exists() {
            std::process::Command::new("pnpm")
                .arg("runtime")
                .current_dir(project_dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            return Err("Runtime not found. Install with: npm i -g ai-agents-leader".to_string());
        }
    }

    // Wait a bit for the runtime to start
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    Ok(false)
}

/// Get the WebSocket port from the port file.
#[tauri::command]
pub fn get_ws_port() -> Result<u16, String> {
    let port_file = dirs::home_dir()
        .ok_or("No home dir")?
        .join(".ai-agents-leader")
        .join("port");

    let content = std::fs::read_to_string(port_file).map_err(|e| e.to_string())?;
    let port: u16 = content.trim().parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    Ok(port)
}
