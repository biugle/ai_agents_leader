#!/usr/bin/env node
/**
 * AI Agents Leader — CLI Entry Point
 *
 * Usage:
 *   aal                    # Start (desktop mode)
 *   aal dev                # Start (web mode)
 *   aal dev:mock           # Start mock (web mode)
 *   aal start              # Start (desktop mode)
 *   aal start:mock         # Start mock (desktop mode)
 *   aal runtime            # Start runtime only
 *   aal runtime:mock       # Start mock runtime only
 *   aal clean              # Kill stale processes
 *   aal check              # Check system status
 *   aal -v / --version     # Show version
 *   aal help               # Show help
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const BUNDLED_CLI_PATH = join(__dirname, '..', '..', '..', 'bundle', 'runtime', 'core', 'cli.js');
const SOURCE_CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const WORKSPACE_MARKER = join(__dirname, '..', '..', '..', 'pnpm-workspace.yaml');
const PUBLIC_PACKAGE_JSON = join(__dirname, '..', '..', '..', 'package.json');
const CORE_PACKAGE_JSON = join(__dirname, '..', 'package.json');

const VERSION = readVersion();

const args = process.argv.slice(2);
const cmd = args[0] || 'start';
const passthroughArgs = args.slice(1);

switch (cmd) {
  case '-v':
  case '--version':
    console.log(`ai-agents-leader v${VERSION}`);
    process.exit(0);
    break;

  case 'help':
  case '--help':
  case '-h':
    console.log('');
    console.log('  AI Agents Leader — 看灯就知道 AI 是否还活着');
    console.log('');
    console.log('  用法:');
    console.log('    aal           启动桌面浮窗（需要 Rust 环境）');
    console.log('    aal dev       启动 Web 模式');
    console.log('    aal dev:mock  启动 Web Mock 模式');
    console.log('    aal start     启动桌面浮窗（需要 Rust 环境）');
    console.log('    aal start:mock 启动桌面 Mock 模式');
    console.log('    aal runtime   仅启动 Runtime');
    console.log('    aal runtime:mock 仅启动 Mock Runtime');
    console.log('    aal clean     清理残留进程');
    console.log('    aal check     检查系统状态');
    console.log('    aal fixit     自动修复常见启动问题');
    console.log('    aal -v        显示版本号');
    console.log('    aal help      显示帮助');
    console.log('');
    process.exit(0);
    break;

  case 'clean':
    runCli(['--clean']);
    break;

  case 'check':
  case 'status':
    runCli(['--check']);
    break;

  case 'fixit':
  case 'doctor':
    runCli(['--fixit']);
    break;

  case 'dev':
    runCli(['--mode=web', ...passthroughArgs]);
    break;

  case 'dev:mock':
    runCli(['--mode=web', '--mock', ...passthroughArgs]);
    break;

  case 'runtime':
    runCli(['--runtime-only', ...passthroughArgs]);
    break;

  case 'runtime:mock':
    runCli(['--runtime-only', '--mock', ...passthroughArgs]);
    break;

  case 'start:mock':
    runCli(['--mode=tauri', '--mock', ...passthroughArgs]);
    break;

  case 'start':
    runCli(['--mode=tauri', ...passthroughArgs]);
    break;

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Run `aal help` to see available commands.');
    process.exit(1);
    break;
}

function runCli(extraArgs) {
  const cliEntry = resolveCliEntry();
  const commandArgs = cliEntry.mode === 'tsx'
    ? [resolveTsxCli(), cliEntry.path, ...extraArgs]
    : [cliEntry.path, ...extraArgs];

  const child = spawn(process.execPath, commandArgs, {
    stdio: 'inherit',
    cwd: join(__dirname, '..'),
  });

  child.on('error', (error) => {
    console.error(`Failed to start CLI: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

function resolveCliEntry() {
  if (process.env.AAL_FORCE_PACKAGED === '1' && existsSync(BUNDLED_CLI_PATH)) {
    return { mode: 'node', path: BUNDLED_CLI_PATH };
  }

  if (existsSync(SOURCE_CLI_PATH) && existsSync(WORKSPACE_MARKER)) {
    return { mode: 'tsx', path: SOURCE_CLI_PATH };
  }

  if (existsSync(BUNDLED_CLI_PATH)) {
    return { mode: 'node', path: BUNDLED_CLI_PATH };
  }

  return { mode: 'tsx', path: SOURCE_CLI_PATH };
}

function readVersion() {
  const candidates = [PUBLIC_PACKAGE_JSON, CORE_PACKAGE_JSON];

  for (const packageJsonPath of candidates) {
    try {
      if (!existsSync(packageJsonPath)) {
        continue;
      }

      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (typeof pkg.version === 'string' && pkg.version.trim()) {
        return pkg.version;
      }
    } catch {}
  }

  return '0.0.0';
}

function resolveTsxCli() {
  try {
    const packageJsonPath = require.resolve('tsx/package.json');
    return join(dirname(packageJsonPath), 'dist', 'cli.mjs');
  } catch {
    console.error('Missing dependency: tsx');
    console.error('Run `pnpm install` in the repository root and try again.');
    process.exit(1);
  }
}
