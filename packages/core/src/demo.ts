/**
 * Demo — 状态展示模式
 * 用 mock adapter 依次展示所有状态，每种停留 3 秒
 */
import { startRuntime } from './index.js';
import { MockAdapter } from '@aal/adapters';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import pino from 'pino';

const log = pino({ name: 'aal-demo' });
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CURRENT_DIR, '../../..');
const OVERLAY_DIR = join(PROJECT_ROOT, 'apps', 'overlay');

async function main() {
  console.log('\n  ⚡ AI Agents Leader — 状态展示\n');

  const runtime = await startRuntime(9988);

  // 注册 mock adapter，每 3 秒切换一次状态
  const mock = new MockAdapter('demo-1', '状态演示', 3000);
  await runtime.adapterManager.register(mock);

  console.log('  每 3 秒切换一次状态，顺序：');
  console.log('  idle → thinking → running → completed');
  console.log('  → idle → thinking → running → error');
  console.log('  → idle → thinking → running → waiting_input');
  console.log('  → idle → running → stalled → 循环\n');
  console.log('  Overlay:  http://localhost:1420');
  console.log('  Ctrl+C 退出\n');

  // 启动 overlay
  const { spawn } = await import('node:child_process');
  const overlay = spawn('pnpm', [
    '--dir',
    OVERLAY_DIR,
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    '1666',
    '--strictPort',
  ], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    env: {
      ...process.env,
      BROWSER: 'none',
    },
  });
  overlay.stdout?.on('data', (d: Buffer) => log.info(d.toString().trim()));
  overlay.stderr?.on('data', (d: Buffer) => log.warn(d.toString().trim()));

  // 优雅退出
  const shutdown = async () => {
    console.log('\n  退出中...');
    if (overlay && !overlay.killed) overlay.kill('SIGTERM');
    await runtime.shutdown();
    console.log('  已退出。\n');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
