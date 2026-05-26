/**
 * AI Agents Leader — 一键启动入口
 *
 * 启动 runtime → 自动发现 agents → 启动 overlay UI → 优雅退出
 * 自动清理残留进程、自动重启崩溃、自动清理过期会话
 */
import { startRuntime } from './index.js';
import {
  ClaudeAdapter,
  CursorAdapter,
  CodexAdapter,
  CopilotChatAdapter,
  ChatGPTAdapter,
  OpenCodeAdapter,
  ClineAdapter,
  RooCodeAdapter,
  MockAdapter,
} from '@aal/adapters';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { DEFAULT_OVERLAY_PORT, DEFAULT_WS_PORT } from '@aal/shared';

const execFileAsync = promisify(execFile);
const log = pino({ name: 'aal-cli' });
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PROJECT_ROOT = resolve(CURRENT_DIR, '../../..');
const WORKSPACE_OVERLAY_DIR = join(PROJECT_ROOT, 'apps', 'overlay');
const CORE_DIR = join(PROJECT_ROOT, 'packages', 'core');
const BUNDLE_DIR = join(PROJECT_ROOT, 'bundle');
const PACKAGED_OVERLAY_TEMPLATE_DIR = join(BUNDLE_DIR, 'overlay-template');

const PORT_DIR = join(homedir(), '.ai-agents-leader');
const PORT_FILE = join(PORT_DIR, 'port');
const DESKTOP_CACHE_DIR = join(PORT_DIR, 'desktop');
const WS_PORT = DEFAULT_WS_PORT;
const OVERLAY_PORT = DEFAULT_OVERLAY_PORT;
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')).version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

function hasWorkspaceOverlay(): boolean {
  if (process.env.AAL_FORCE_PACKAGED === '1') {
    return false;
  }

  return existsSync(join(PROJECT_ROOT, 'pnpm-workspace.yaml')) && existsSync(join(WORKSPACE_OVERLAY_DIR, 'package.json'));
}

function hasPackagedOverlayTemplate(): boolean {
  return existsSync(join(PACKAGED_OVERLAY_TEMPLATE_DIR, 'dist', 'index.html'))
    && existsSync(join(PACKAGED_OVERLAY_TEMPLATE_DIR, 'src-tauri', 'Cargo.toml'));
}

function resolvePackagedOverlayDir(): string {
  return join(DESKTOP_CACHE_DIR, VERSION, 'overlay');
}

function resolvePackagedOverlayVersionFile(): string {
  return join(resolvePackagedOverlayDir(), '.aal-template-version');
}

function preparePackagedOverlayWorkspace(): string {
  if (!hasPackagedOverlayTemplate()) {
    throw new Error('Packaged overlay template not found. Reinstall the package or run the release asset build first.');
  }

  const overlayDir = resolvePackagedOverlayDir();
  const versionFile = resolvePackagedOverlayVersionFile();
  let shouldRefresh = !existsSync(versionFile);

  if (!shouldRefresh) {
    try {
      shouldRefresh = readFileSync(versionFile, 'utf-8').trim() !== VERSION;
    } catch {
      shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
    rmSync(overlayDir, { recursive: true, force: true });
    mkdirSync(join(DESKTOP_CACHE_DIR, VERSION), { recursive: true });
    cpSync(PACKAGED_OVERLAY_TEMPLATE_DIR, overlayDir, { recursive: true });
    writeFileSync(versionFile, VERSION, 'utf-8');
  }

  return overlayDir;
}

function resolveTauriCliPath(): string | null {
  const searchPaths = [PROJECT_ROOT, WORKSPACE_OVERLAY_DIR];

  for (const searchPath of searchPaths) {
    try {
      const packageJsonPath = require.resolve('@tauri-apps/cli/package.json', { paths: [searchPath] });
      return join(dirname(packageJsonPath), 'tauri.js');
    } catch {
      // Try the next location.
    }
  }

  return null;
}

function readOverlayBinaryName(overlayDir: string): string {
  try {
    const cargoToml = readFileSync(join(overlayDir, 'src-tauri', 'Cargo.toml'), 'utf-8');
    const match = cargoToml.match(/^name\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? 'ai-agents-leader-overlay';
  } catch {
    return 'ai-agents-leader-overlay';
  }
}

function resolvePackagedExecutablePath(overlayDir: string): string {
  const binaryName = readOverlayBinaryName(overlayDir);
  const extension = process.platform === 'win32' ? '.exe' : '';
  const directBinary = join(overlayDir, 'src-tauri', 'target', 'release', `${binaryName}${extension}`);

  if (existsSync(directBinary)) {
    return directBinary;
  }

  if (process.platform === 'darwin') {
    const macAppBinary = join(
      overlayDir,
      'src-tauri',
      'target',
      'release',
      'bundle',
      'macos',
      'AI Agents Leader.app',
      'Contents',
      'MacOS',
      binaryName,
    );

    if (existsSync(macAppBinary)) {
      return macAppBinary;
    }
  }

  return directBinary;
}

async function runNodeScript(scriptPath: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`node ${scriptPath} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

async function startPackagedTauriOverlay(): Promise<ChildProcess> {
  const tauriCliPath = resolveTauriCliPath();
  if (!tauriCliPath) {
    throw new Error('Tauri CLI is not available in this installation.');
  }

  const overlayDir = preparePackagedOverlayWorkspace();
  let executablePath = resolvePackagedExecutablePath(overlayDir);

  if (!existsSync(executablePath)) {
    log.info('Building packaged Tauri overlay...');
    console.log('  模式:    Tauri 桌面应用（首次本地构建约 2-5 分钟）');
    console.log('  构建:    使用已安装 Rust 环境本地编译桌面端');
    await runNodeScript(tauriCliPath, ['build'], overlayDir);
    executablePath = resolvePackagedExecutablePath(overlayDir);
  } else {
    console.log('  模式:    Tauri 桌面应用（已缓存桌面端）');
  }

  if (!existsSync(executablePath)) {
    throw new Error(`Built overlay executable not found at ${executablePath}`);
  }

  const child = spawn(executablePath, [], {
    cwd: overlayDir,
    stdio: 'ignore',
  });

  return child;
}

// Parse CLI args
const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const MODE: 'web' | 'tauri' = modeArg?.split('=')[1] === 'tauri' ? 'tauri' : 'web';
const IS_CLEAN = args.includes('--clean');
const IS_CHECK = args.includes('--check');
const IS_FIXIT = args.includes('--fixit');
const IS_RUNTIME_ONLY = args.includes('--runtime-only');
const IS_MOCK = args.includes('--mock');
const mockCountArg = args.find((a) => a.startsWith('--mock-count='));
const parsedMockCount = Number.parseInt(mockCountArg?.split('=')[1] ?? process.env.AAL_MOCK_COUNT ?? '12', 10);
const MOCK_AGENT_COUNT = Number.isFinite(parsedMockCount) ? Math.min(Math.max(parsedMockCount, 1), 48) : 12;

const MOCK_AGENT_TEMPLATES = [
  'Claude Code',
  'Cursor',
  'Codex',
  'OpenCode',
  'Cline',
  'Roo Code',
  'Gemini CLI',
  'Aider',
  'Windsurf',
  'Bolt',
  'Devin',
  'Amp',
] as const;

// ── 清理残留进程 ──────────────────────────────────────────

async function killStaleProcesses(): Promise<void> {
  // Runtime / overlay cleanup is port-driven to avoid killing unrelated tsx processes.
  try { unlinkSync(PORT_FILE); } catch {}
}

/** Kill processes occupying specific ports */
async function killPortOccupants(...ports: number[]): Promise<void> {
  for (const port of ports) {
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), 'SIGKILL');
          log.info(`Killed process ${pid} on port ${port}`);
        } catch {}
      }
    } catch {}
  }
}

/** Kill previous overlay processes (Tauri app / Vite dev server) */
async function killOverlayProcesses(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (/ai-agents-leader-overlay/.test(line) && !/grep/.test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1], 10);
        if (pid) {
          try {
            process.kill(pid, 'SIGKILL');
            log.info(`Killed overlay process: ${pid}`);
          } catch {}
        }
      }
    }
  } catch {}
}

/** Check if Rust toolchain is available */
async function isRustAvailable(): Promise<boolean> {
  try {
    await execFileAsync('rustc', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function canRunPnpm(args: string[], cwd = PROJECT_ROOT): Promise<boolean> {
  try {
    await execFileAsync('pnpm', args, { cwd });
    return true;
  } catch {
    return false;
  }
}

async function isOverlayCliAvailable(bin: 'vite' | 'tauri'): Promise<boolean> {
  if (!hasWorkspaceOverlay()) {
    return false;
  }

  return canRunPnpm(['--dir', WORKSPACE_OVERLAY_DIR, 'exec', bin, '--version']);
}

async function getPortOccupant(port: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
    return stdout.trim().split('\n').find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function spawnPnpm(args: string[], cwd = PROJECT_ROOT): ChildProcess {
  return spawn('pnpm', args, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      BROWSER: 'none',
    },
  });
}

async function runPnpmStreaming(args: string[], cwd = PROJECT_ROOT): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('pnpm', args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`pnpm ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

// ── Hooks 插件安装 ─────────────────────────────────────────

function installHooksPlugin(): void {
  const pluginDir = join(homedir(), '.claude', 'plugins', 'ai-agents-leader');
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');

  try {
    if (existsSync(manifestPath)) return; // already installed
  } catch {}

  try {
    mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });
    mkdirSync(join(pluginDir, 'hooks'), { recursive: true });

    // plugin.json
    writeFileSync(manifestPath, JSON.stringify({
      name: 'ai-agents-leader',
      description: 'Real-time state reporting for AI Agents Leader overlay',
      author: { name: 'AI Agents Leader' },
    }, null, 2));

    // hooks.json
    writeFileSync(join(pluginDir, 'hooks', 'hooks.json'), JSON.stringify({
      description: 'AI Agents Leader — real-time state reporting',
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: `node "${join(pluginDir, 'hooks', 'report-state.mjs')}" waiting_input`, timeout: 5 }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: `node "${join(pluginDir, 'hooks', 'report-state.mjs')}" running`, timeout: 5 }] }],
        Stop: [{ hooks: [{ type: 'command', command: `node "${join(pluginDir, 'hooks', 'report-state.mjs')}" completed`, timeout: 5 }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: `node "${join(pluginDir, 'hooks', 'report-state.mjs')}" thinking`, timeout: 5 }] }],
      },
    }, null, 2));

    // report-state.mjs
    const scriptContent = `#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const status = process.argv[2];
if (!status) process.exit(0);

const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
const agentId = 'claude-' + sessionId.slice(0, 8);

let apiPort = 9989;
const portFile = join(homedir(), '.ai-agents-leader', 'port');
try {
  if (existsSync(portFile)) {
    const wsPort = parseInt(readFileSync(portFile, 'utf-8').trim(), 10);
    if (!isNaN(wsPort)) apiPort = wsPort + 1;
  }
} catch {}

if (process.env.AAL_API_PORT) apiPort = parseInt(process.env.AAL_API_PORT, 10);

let hookInput = '';
try { hookInput = readFileSync('/dev/stdin', 'utf-8'); } catch {}

let toolName = '';
try { toolName = JSON.parse(hookInput).tool_name || ''; } catch {}

const directory = process.cwd();

const update = {
  agentId,
  agentName: 'ClaudeCode · ' + sessionId.slice(0, 4),
  status,
  meta: { source: 'claude-hook', tool: toolName || undefined, directory, timestamp: Date.now() },
};

fetch('http://127.0.0.1:' + apiPort + '/api/state', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(update),
}).catch(() => {});

process.exit(0);
`;
    writeFileSync(join(pluginDir, 'hooks', 'report-state.mjs'), scriptContent);

    log.info('Hooks plugin installed');
    console.log('  Hooks:   已安装 (需要重启 Claude Code 生效)');
  } catch (err) {
    log.warn({ err }, 'Failed to install hooks plugin');
  }
}

// ── 进程检测 ────────────────────────────────────────────────

async function isProcessRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    const pattern = new RegExp(`\\b${name}\\b`, 'i');
    return stdout.split('\n').some((l) => pattern.test(l) && !/grep/.test(l));
  } catch {
    return false;
  }
}

/** Check if codex is the standalone CLI (not VS Code extension's app-server) */
async function isCodexCliRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ps', ['aux']);
    return stdout.split('\n').some((l) => /\bcodex\b/i.test(l) && !/grep|app-server|extension/i.test(l));
  } catch {
    return false;
  }
}

// ── Overlay 启动 ────────────────────────────────────────────

async function startOverlay(mode: 'web' | 'tauri'): Promise<ChildProcess | null> {
  const workspaceOverlay = hasWorkspaceOverlay();
  const packagedOverlay = hasPackagedOverlayTemplate();

  if (!workspaceOverlay && !packagedOverlay) {
    throw new Error('Overlay assets are not available in this installation.');
  }

  // Kill any previous overlay processes and free the port
  await killOverlayProcesses();
  await killPortOccupants(OVERLAY_PORT);

  if (!workspaceOverlay) {
    if (mode !== 'tauri') {
      console.log('  ⚠ 发布包暂不提供 aal dev，自动切换为桌面模式\n');
    }

    const hasRust = await isRustAvailable();
    if (!hasRust) {
      throw new Error('Rust is required for the packaged desktop build path.');
    }

    return startPackagedTauriOverlay();
  }

  if (mode === 'tauri') {
    // Check Rust availability
    const hasRust = await isRustAvailable();
    if (!hasRust) {
      console.log('  ⚠ Rust 未安装，自动切换为 Web 模式');
      console.log('');
      console.log('  安装 Rust（桌面浮窗模式需要）：');
      if (process.platform === 'darwin') {
        console.log('    macOS:   curl --proto=\'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh');
        console.log('             或: brew install rust');
      } else if (process.platform === 'win32') {
        console.log('    Windows: 下载安装 https://rustup.rs/');
        console.log('             或: winget install Rustlang.Rustup');
      } else {
        console.log('    Linux:   curl --proto=\'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh');
        console.log('             或: sudo apt install rustc cargo');
      }
      console.log('');
      console.log('  安装后重启终端，运行: pnpm start');
      console.log('');
      mode = 'web';
    } else {
      const hasTauriCli = await isOverlayCliAvailable('tauri');
      if (!hasTauriCli) {
        console.log('  ⚠ Tauri CLI 未安装，自动切换为 Web 模式\n');
        mode = 'web';
      } else {
        log.info('Starting Tauri overlay...');
        console.log('  模式:    Tauri 桌面应用（首次编译约 2-3 分钟）');
        const child = spawnPnpm(['--dir', WORKSPACE_OVERLAY_DIR, 'exec', 'tauri', 'dev']);
        child.stdout?.on('data', (d: Buffer) => log.info(d.toString().trim()));
        child.stderr?.on('data', (d: Buffer) => log.warn(d.toString().trim()));
        return child;
      }
    }
  }

  // Web mode (Vite)
  log.info('Starting Vite overlay...');
  console.log('  模式:    Web 浏览器');
  const child = spawnPnpm([
    '--dir',
    WORKSPACE_OVERLAY_DIR,
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(OVERLAY_PORT),
    '--strictPort',
  ]);
  child.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) log.info(line);
  });
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) log.warn(line);
  });
  return child;
}

async function printSystemStatus(): Promise<void> {
  const hasRust = await isRustAvailable();
  const workspaceOverlay = hasWorkspaceOverlay();
  const packagedOverlay = hasPackagedOverlayTemplate();
  const coreTsx = workspaceOverlay
    ? await canRunPnpm(['--dir', CORE_DIR, 'exec', 'tsx', '--version'])
    : existsSync(join(BUNDLE_DIR, 'runtime', 'core', 'cli.js'));
  const overlayVite = workspaceOverlay ? await isOverlayCliAvailable('vite') : packagedOverlay;
  const overlayTauri = resolveTauriCliPath() !== null;
  const wsOccupant = await getPortOccupant(WS_PORT);
  const apiOccupant = await getPortOccupant(WS_PORT + 1);
  const overlayOccupant = await getPortOccupant(OVERLAY_PORT);

  console.log(`  版本:    ${VERSION || '0.1.0'}`);
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Rust:    ${hasRust ? '✓ 已安装' : '✗ 未安装（桌面模式需要）'}`);
  console.log(`  平台:    ${process.platform} ${process.arch}`);
  console.log(`  Core:    ${coreTsx ? (workspaceOverlay ? '✓ tsx 可用' : '✓ 发布态运行时可用') : '✗ runtime 不可用'}`);
  console.log(`  Overlay: ${overlayVite ? (workspaceOverlay ? '✓ vite 可用' : '✓ 打包模板可用') : '✗ overlay 不可用'}`);
  console.log(`  Tauri:   ${overlayTauri ? '✓ CLI 可用' : '✗ CLI 不可用'}`);
  console.log(`  WS端口:  ${wsOccupant ? `占用 (${wsOccupant})` : '空闲'}`);
  console.log(`  API端口: ${apiOccupant ? `占用 (${apiOccupant})` : '空闲'}`);
  console.log(`  UI端口:  ${overlayOccupant ? `占用 (${overlayOccupant})` : '空闲'}`);
}

async function runFixit(): Promise<void> {
  console.log('  诊断并修复启动环境...');
  await killStaleProcesses();
  await killPortOccupants(WS_PORT, WS_PORT + 1, OVERLAY_PORT);

  if (!hasWorkspaceOverlay()) {
    console.log('  当前为发布态安装，Node 依赖随 npm 包提供。');
    console.log('  若桌面模式失败，请确认 Rust 与 Tauri CLI 依赖已就绪。');
    console.log('');
    await printSystemStatus();
    console.log('');
    return;
  }

  const missingTools: string[] = [];
  if (!(await canRunPnpm(['--dir', CORE_DIR, 'exec', 'tsx', '--version']))) {
    missingTools.push('core/tsx');
  }
  if (!(await isOverlayCliAvailable('vite'))) {
    missingTools.push('overlay/vite');
  }

  if (missingTools.length > 0) {
    console.log(`  缺少依赖: ${missingTools.join(', ')}`);
    console.log('  执行 pnpm install ...');
    await runPnpmStreaming(['install']);
  } else {
    console.log('  依赖完整，无需重新安装。');
  }

  console.log('');
  await printSystemStatus();
  console.log('');
}

// ── Agent 发现 ──────────────────────────────────────────────

async function discoverAgents(runtime: Awaited<ReturnType<typeof startRuntime>>): Promise<{
  registeredClaudeIds: Set<string>;
  detectedAgents: Set<string>;
  agentCount: number;
}> {
  if (IS_MOCK) {
    const detectedAgents = new Set<string>();
    const mockAgents = Array.from({ length: MOCK_AGENT_COUNT }, (_, index) => {
      const templateName = MOCK_AGENT_TEMPLATES[index % MOCK_AGENT_TEMPLATES.length];
      const suffix = index >= MOCK_AGENT_TEMPLATES.length ? ` ${Math.floor(index / MOCK_AGENT_TEMPLATES.length) + 1}` : '';
      return [
        `mock-${templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
        `${templateName}${suffix} · mock`,
      ] as const;
    });

    for (const [id, displayName] of mockAgents) {
      await runtime.adapterManager.register(
        new MockAdapter(id, displayName, 3000, {
          randomize: true,
          intervalRangeMs: [1800, 5200],
        })
      );
    }

    return {
      registeredClaudeIds: new Set<string>(),
      detectedAgents,
      agentCount: mockAgents.length,
    };
  }

  let agentCount = 0;
  const registeredClaudeIds = new Set<string>();

  // Claude Code — 支持多会话
  const claudeSessions = ClaudeAdapter.findActiveSessions();
  for (const session of claudeSessions) {
    const adapter = new ClaudeAdapter(session.path, session.projectName, session.projectDir);
    registeredClaudeIds.add(adapter.id);
    log.info(`Detected: ${adapter.displayName} (${adapter.id})`);
    await runtime.adapterManager.register(adapter);
    agentCount++;
  }

  // Cursor IDE
  const detectedAgents = new Set<string>();
  if (await isProcessRunning('Cursor')) {
    detectedAgents.add('cursor');
    log.info('Detected: Cursor');
    await runtime.adapterManager.register(new CursorAdapter());
    agentCount++;
  }

  // Codex (OpenAI CLI) — must be standalone CLI, not VS Code extension's "codex app-server"
  if (await isCodexCliRunning() && existsSync(join(homedir(), '.codex'))) {
    detectedAgents.add('codex');
    log.info('Detected: CodeX');
    await runtime.adapterManager.register(new CodexAdapter());
    agentCount++;
  }

  // OpenCode
  if (await isProcessRunning('opencode')) {
    detectedAgents.add('opencode');
    log.info('Detected: OpenCode');
    await runtime.adapterManager.register(new OpenCodeAdapter());
    agentCount++;
  }

  if (await isProcessRunning('Code') && CopilotChatAdapter.isInstalled()) {
    detectedAgents.add('copilot-chat');
    log.info('Detected: GitHub Copilot Chat');
    await runtime.adapterManager.register(new CopilotChatAdapter());
    agentCount++;
  }

  if (await isProcessRunning('Code') && ChatGPTAdapter.isInstalled()) {
    detectedAgents.add('chatgpt-vscode');
    log.info('Detected: OpenAI ChatGPT (VS Code)');
    await runtime.adapterManager.register(new ChatGPTAdapter());
    agentCount++;
  }

  // Cline (VS Code extension)
  if (await isProcessRunning('Code') && ClineAdapter.findStorageDir()) {
    detectedAgents.add('cline');
    log.info('Detected: Cline');
    await runtime.adapterManager.register(new ClineAdapter());
    agentCount++;
  }

  // Roo Code (VS Code extension)
  if (await isProcessRunning('Code') && RooCodeAdapter.findStorageDir()) {
    detectedAgents.add('roo');
    log.info('Detected: RooCode');
    await runtime.adapterManager.register(new RooCodeAdapter());
    agentCount++;
  }

  return { registeredClaudeIds, detectedAgents, agentCount };
}

// ── 定期扫描 + 清理 ────────────────────────────────────────

function startPolling(
  runtime: Awaited<ReturnType<typeof startRuntime>>,
  registeredClaudeIds: Set<string>,
  detectedAgents: Set<string>,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      // Claude — 多会话：检测新会话
      const newSessions = ClaudeAdapter.findActiveSessions();
      const activeSessionIds = new Set<string>();
      for (const session of newSessions) {
        const adapter = new ClaudeAdapter(session.path, session.projectName, session.projectDir);
        activeSessionIds.add(adapter.id);
        if (!registeredClaudeIds.has(adapter.id)) {
          registeredClaudeIds.add(adapter.id);
          log.info(`New session: ${adapter.displayName}`);
          await runtime.adapterManager.register(adapter);
        }
      }

      // Claude — 清理已关闭的会话
      for (const id of registeredClaudeIds) {
        if (!activeSessionIds.has(id)) {
          log.info(`Session closed: ${id}`);
          await runtime.adapterManager.unregister(id);
          registeredClaudeIds.delete(id);
        }
      }

      // 其他 agents — 进程检测 + 清理
      const checks: [string, () => Promise<boolean>][] = [
        ['cursor', () => isProcessRunning('Cursor')],
        ['codex', async () => (await isCodexCliRunning()) && existsSync(join(homedir(), '.codex'))],
        ['opencode', () => isProcessRunning('opencode')],
      ];

      for (const [name, check] of checks) {
        const running = await check();
        if (running && !detectedAgents.has(name)) {
          detectedAgents.add(name);
          const AdapterMap: Record<string, any> = {
            cursor: CursorAdapter,
            codex: CodexAdapter,
            opencode: OpenCodeAdapter,
          };
          log.info(`Detected: ${name}`);
          await runtime.adapterManager.register(new AdapterMap[name]());
        } else if (!running && detectedAgents.has(name)) {
          detectedAgents.delete(name);
          log.info(`Process exited: ${name}`);
          await runtime.adapterManager.unregister(name);
        }
      }
    } catch (err) {
      log.warn({ err }, 'Polling error');
    }
  }, 10_000);
}

// ── 主流程 ──────────────────────────────────────────────────

async function main() {
  console.log('\n  ⚡ AI Agents Leader\n');

  // Handle --clean: just kill stale processes and exit
  if (IS_CLEAN) {
    console.log('  清理残留进程...');
    await killStaleProcesses();
    await killPortOccupants(WS_PORT, WS_PORT + 1, OVERLAY_PORT);
    console.log('  已清理。\n');
    process.exit(0);
  }

  // Handle --check: show system status and exit
  if (IS_CHECK) {
    await printSystemStatus();
    console.log('');
    process.exit(0);
  }

  if (IS_FIXIT) {
    await runFixit();
    process.exit(0);
  }

  // 0. 清理残留进程
  console.log('  清理旧进程...');
  await killStaleProcesses();
  await new Promise((r) => setTimeout(r, 500));

  // 1. 启动 Runtime
  let runtime: Awaited<ReturnType<typeof startRuntime>>;
  try {
    runtime = await startRuntime(WS_PORT);
  } catch (err) {
    log.error({ err }, 'Failed to start runtime');
    console.error('  启动失败，端口可能被占用。尝试手动清理: lsof -i :9988');
    process.exit(1);
  }

  // Write port file for hook discovery
  try { mkdirSync(PORT_DIR, { recursive: true }); } catch {}
  writeFileSync(PORT_FILE, String(runtime.port), 'utf-8');

  // 2. Install hooks plugin
  installHooksPlugin();

  // 3. 自动发现所有 agents
  const { registeredClaudeIds, detectedAgents, agentCount } = await discoverAgents(runtime);

  console.log(`  Runtime:  ws://localhost:${runtime.port}`);
  console.log(`  Agents:   ${agentCount} detected`);
  if (IS_MOCK) {
    console.log('  数据源:   Mock');
  } else if (agentCount === 0) {
    console.log('  数据源:   Real (none detected)');
  } else {
    console.log('  数据源:   Real');
  }

  if (IS_RUNTIME_ONLY) {
    console.log('  模式:    Runtime only');
    console.log('\n  Runtime 已启动。Ctrl+C 退出。\n');

    const pollTimer = startPolling(runtime, registeredClaudeIds, detectedAgents);
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n  正在清理...');
      clearInterval(pollTimer);
      await runtime.shutdown();
      try { unlinkSync(PORT_FILE); } catch {}
      console.log('  已退出。\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      log.error({ err }, 'Uncaught exception');
      shutdown();
    });
    process.on('unhandledRejection', (err) => {
      log.error({ err }, 'Unhandled rejection');
      shutdown();
    });
    return;
  }

  // 4. 启动 Overlay
  const overlay = await startOverlay(MODE);
  await new Promise((r) => setTimeout(r, 3000));
  console.log(`  Overlay:  http://localhost:${OVERLAY_PORT}`);
  console.log('\n  看灯就知道 AI 是否还活着。Ctrl+C 退出。\n');

  // 5. 定期扫描 + 清理
  const pollTimer = startPolling(runtime, registeredClaudeIds, detectedAgents);

  // 6. 优雅退出
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n  正在清理...');

    clearInterval(pollTimer);

    if (overlay && !overlay.killed) {
      overlay.kill('SIGTERM');
      setTimeout(() => {
        if (overlay && !overlay.killed) overlay.kill('SIGKILL');
      }, 2000);
    }

    await runtime.shutdown();

    try { unlinkSync(PORT_FILE); } catch {}

    console.log('  已退出。\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    if (overlay && !overlay.killed) {
      try { overlay.kill('SIGKILL'); } catch {}
    }
  });

  // 7. Auto-restart on unexpected exit
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'Uncaught exception');
    shutdown();
  });
  process.on('unhandledRejection', (err) => {
    log.error({ err }, 'Unhandled rejection');
    shutdown();
  });
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
