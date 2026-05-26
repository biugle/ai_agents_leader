#!/usr/bin/env node
/**
 * AI Agents Leader — Claude Code hook script
 *
 * Reports agent state to the runtime HTTP API.
 * Cross-platform (macOS, Windows, Linux).
 *
 * Usage: node report-state.mjs <status>
 * Environment:
 *   CLAUDE_CODE_SESSION_ID — current session ID
 *   AAL_API_PORT           — runtime API port (default: 9989)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const status = process.argv[2];
if (!status) {
  process.exit(0);
}

const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
const agentId = `claude-${sessionId.slice(0, 8)}`;

// Try to read port from runtime port file
let apiPort = 9989;
const portFile = join(homedir(), '.ai-agents-leader', 'port');
try {
  if (existsSync(portFile)) {
    const wsPort = parseInt(readFileSync(portFile, 'utf-8').trim(), 10);
    if (!isNaN(wsPort)) apiPort = wsPort + 1; // API is on WS port + 1
  }
} catch {
  // use default
}

// Allow override via env
if (process.env.AAL_API_PORT) {
  apiPort = parseInt(process.env.AAL_API_PORT, 10);
}

// Read stdin for hook input (tool name, etc.)
let hookInput = '';
try {
  hookInput = readFileSync('/dev/stdin', 'utf-8');
} catch {
  // stdin might not be available
}

let toolName = '';
try {
  const parsed = JSON.parse(hookInput);
  toolName = parsed.tool_name || '';
} catch {
  // not JSON
}

// Build state update
const update = {
  agentId,
  agentName: `Claude · ${sessionId.slice(0, 4)}`,
  status,
  meta: {
    source: 'claude-hook',
    tool: toolName || undefined,
    timestamp: Date.now(),
  },
};

// Send to runtime API
const url = `http://127.0.0.1:${apiPort}/api/state`;
const body = JSON.stringify(update);

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
}).catch(() => {
  // Runtime might not be running — that's OK
});

// Always exit 0 to not block Claude
process.exit(0);
