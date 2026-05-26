import { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { ThemeProvider } from '@aal/ui';
import { SignalPod, FloatingGroup } from '@aal/ui';
import { useWebSocket } from './hooks/useWebSocket';
import { useAgentStore } from './stores/agentStore';

const WEB_MAX_VIEWPORT_RATIO = 0.99;
const DESKTOP_MAX_VIEWPORT_RATIO = 0.8;
const DESKTOP_OUTER_VERTICAL_PADDING = 16;
const DESKTOP_MIN_WINDOW_HEIGHT = 128;

function App() {
  const isDesktopShell = isTauri();
  const { sendNudge } = useWebSocket();
  const agentsMap = useAgentStore((s) => s.agents);
  const agents = useMemo(() => Array.from(agentsMap.values()), [agentsMap]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [preferredHeight, setPreferredHeight] = useState(DESKTOP_MIN_WINDOW_HEIGHT);

  useEffect(() => {
    document.documentElement.dataset.aalShell = isDesktopShell ? 'desktop' : 'web';
    document.body.dataset.aalShell = isDesktopShell ? 'desktop' : 'web';

    return () => {
      delete document.documentElement.dataset.aalShell;
      delete document.body.dataset.aalShell;
    };
  }, [isDesktopShell]);

  useEffect(() => {
    if (!isDesktopShell) {
      return;
    }

    const appWindow = getCurrentWindow();
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let frameId = 0;

    const syncWindowHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(async () => {
        const minHeight = DESKTOP_MIN_WINDOW_HEIGHT + DESKTOP_OUTER_VERTICAL_PADDING;
        const maxHeight = Math.floor(window.screen.availHeight * DESKTOP_MAX_VIEWPORT_RATIO);
        const nextHeight = Math.max(
          minHeight,
          Math.min(preferredHeight + DESKTOP_OUTER_VERTICAL_PADDING, maxHeight),
        );

        try {
          const currentSize = await appWindow.innerSize();
          await appWindow.setSize(new LogicalSize(currentSize.width, nextHeight));
        } catch {
          // Ignore resize failures outside the desktop shell.
        }
      });
    };

    const observer = new ResizeObserver(() => {
      syncWindowHeight();
    });

    observer.observe(container);
    syncWindowHeight();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [agents.length, isDesktopShell, preferredHeight]);

  return (
    <ThemeProvider>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          minHeight: isDesktopShell ? '100vh' : 'auto',
          height: isDesktopShell ? '100vh' : 'auto',
          maxHeight: isDesktopShell ? 'none' : `${Math.round(WEB_MAX_VIEWPORT_RATIO * 100)}dvh`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          minWidth: 0,
          background: 'transparent',
          padding: 8,
          boxSizing: 'border-box',
          overflowY: 'hidden',
          overflowX: 'hidden',
        }}
      >
        <FloatingGroup
          isDesktopShell={isDesktopShell}
          webMaxViewportRatio={WEB_MAX_VIEWPORT_RATIO}
          onPreferredHeightChange={setPreferredHeight}
        >
          {agents.length === 0 ? (
            <div
              style={{
                color: 'var(--aal-text-muted)',
                fontSize: 12,
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              No agents detected
            </div>
          ) : (
            agents.map((agent) => (
              <SignalPod key={agent.id} agent={agent} onNudge={sendNudge} />
            ))
          )}
        </FloatingGroup>
      </div>
    </ThemeProvider>
  );
}

export default App;
