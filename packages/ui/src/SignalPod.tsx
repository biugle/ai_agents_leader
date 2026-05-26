import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentInfo } from '@aal/shared';
import { statusToGroup, STATUS_LABELS } from '@aal/shared';
import { SignalLight } from './SignalLight.js';

interface SignalPodProps {
  agent: AgentInfo;
  onNudge?: (id: string) => void;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}`;
}

const ACTIVE_STATES = new Set(['thinking', 'running', 'waiting_input']);

/**
 * Signal Pod — the core UI unit.
 * Shows agent name, 3 signal lights, and a nudge button.
 */
export function SignalPod({ agent, onNudge }: SignalPodProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [nudgeFlash, setNudgeFlash] = useState(false);
  const group = statusToGroup(agent.status);

  const isActive = ACTIVE_STATES.has(agent.status);
  const activityStart = (agent.meta?.activityStart as number) || 0;
  const lastActive = agent.lastActive || (agent.meta?.lastActive as number) || 0;

  // Live elapsed counter
  useEffect(() => {
    if (!isActive || !activityStart) {
      setElapsed(0);
      return;
    }
    setElapsed(Date.now() - activityStart);
    const timer = setInterval(() => {
      setElapsed(Date.now() - activityStart);
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive, activityStart]);

  return (
    <motion.div
      className="aal-pod"
      style={{
        background: 'var(--aal-surface)',
        backdropFilter: `blur(var(--aal-pod-blur))`,
        borderRadius: 'var(--aal-pod-radius)',
        border: '1px solid var(--aal-border)',
        boxShadow: 'var(--aal-pod-shadow)',
        padding: '12px 16px',
        width: '100%',
        minWidth: 0,
        userSelect: 'none',
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      layout
    >
      {/* Header — click to expand/collapse */}
      <div
        data-tauri-drag-region="false"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <span
          style={{ color: '#ccc', fontSize: 20, flexShrink: 0, marginTop: -2 }}
        >
          {expanded ? '▴' : '▾'}
        </span>
        <span
          style={{
            color: 'var(--aal-text)',
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={agent.displayName}
        >
          {agent.displayName}
        </span>
      </div>

      {/* Lights + Tail */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <SignalLight group={group} index={0} />
          <SignalLight group={group} index={1} />
          <SignalLight group={group} index={2} />
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <motion.button
            data-tauri-drag-region="false"
            onClick={(e) => {
              e.stopPropagation();
              onNudge?.(agent.id);
              setNudgeFlash(true);
              setTimeout(() => setNudgeFlash(false), 600);
            }}
            animate={nudgeFlash ? { scale: [1, 1.4, 1], color: ['#737373', '#F5A623', '#737373'] } : {}}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--aal-text-muted)',
              fontSize: 20,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
            }}
            title="Nudge — send attention signal"
          >
            ✦
          </motion.button>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="aal-details" style={{ position: 'relative' }}>
              <div title={`Status: ${STATUS_LABELS[agent.status]}`}>Status: {STATUS_LABELS[agent.status]}</div>
              <div title={`Dir: ${agent.meta?.directory as string || '—'}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>
                Dir: {agent.meta?.directory as string || '—'}
              </div>
              <div title={`Time: ${isActive && elapsed > 0 ? formatElapsed(elapsed) : '—'} / ${formatTimestamp(lastActive)}`}>
                Time: {isActive && elapsed > 0 ? formatElapsed(elapsed) : '—'} / {formatTimestamp(lastActive)}
              </div>
              <span className="aal-details-tooltip">{`Status: ${STATUS_LABELS[agent.status]}\nDir: ${agent.meta?.directory as string || '—'}\nTime: ${isActive && elapsed > 0 ? formatElapsed(elapsed) : '—'} / ${formatTimestamp(lastActive)}`}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
