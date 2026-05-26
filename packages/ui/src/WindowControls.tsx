import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Window control buttons: minimize, toggle-pin, close.
 */
export function WindowControls() {
  const [pinned, setPinned] = useState(true);

  const handleMinimize = async () => {
    try { await getCurrentWindow().minimize(); } catch {}
  };

  const handleClose = async () => {
    try { await getCurrentWindow().close(); } catch {}
  };

  const handleTogglePin = async () => {
    try {
      await getCurrentWindow().setAlwaysOnTop(!pinned);
      setPinned(!pinned);
    } catch {}
  };

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--aal-text-muted)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
    borderRadius: 4,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        padding: '0 2px 6px',
      }}
    >
      <button data-tauri-drag-region="false" style={btnStyle} onClick={handleMinimize} title="Minimize">
        –
      </button>
      <button
        data-tauri-drag-region="false"
        style={{ ...btnStyle, color: pinned ? 'var(--aal-light-running)' : 'var(--aal-text-muted)' }}
        onClick={handleTogglePin}
        title={pinned ? 'Send to back' : 'Bring to front'}
      >
        {pinned ? '▲' : '▼'}
      </button>
      <button data-tauri-drag-region="false" style={btnStyle} onClick={handleClose} title="Close">
        ✕
      </button>
    </div>
  );
}
