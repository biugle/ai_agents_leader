//! Window management utilities for the overlay.
//!
//! Supports:
//! - Multi-monitor positioning
//! - Window snapping
//! - Free-drag mode

use tauri::Manager;

/// Get the primary monitor size.
#[allow(dead_code)]
pub fn get_primary_monitor_size(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let size = monitor.size();
            return Some((size.width as f64, size.height as f64));
        }
    }
    None
}
