import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Detects if a Claude CLI process is running.
 * Cross-platform: uses `ps` on macOS/Linux, `tasklist` on Windows.
 */
export class ClaudeProcessDetector {
  async isRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        return await this.checkWindows();
      }
      return await this.checkUnix();
    } catch {
      return false;
    }
  }

  private async checkUnix(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('ps', ['aux']);
      const lines = stdout.split('\n');
      for (const line of lines) {
        // Match claude processes but not this adapter itself
        if (/\bclaude\b/i.test(line) && !/process-detector/.test(line)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async checkWindows(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/NH']);
      return stdout.includes('claude.exe');
    } catch {
      return false;
    }
  }
}
