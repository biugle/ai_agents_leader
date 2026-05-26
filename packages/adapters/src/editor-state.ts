import type { SignalStatus } from '@aal/shared';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

type EditorApp = 'code' | 'cursor';
type StorageKind = 'globalStorage' | 'workspaceStorage';

export function resolveEditorStorageDir(app: EditorApp, kind: StorageKind): string {
  const appName = app === 'cursor' ? 'Cursor' : 'Code';

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', appName, 'User', kind);
  }

  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', appName, 'User', kind);
  }

  return join(homedir(), '.config', appName, 'User', kind);
}

export function resolveEditorExtensionsDir(app: EditorApp): string {
  if (process.platform === 'win32') {
    return join(homedir(), app === 'cursor' ? '.cursor' : '.vscode', 'extensions');
  }

  return join(homedir(), app === 'cursor' ? '.cursor' : '.vscode', 'extensions');
}

export function hasInstalledExtension(app: EditorApp, prefixes: string[]): boolean {
  try {
    const extensionsDir = resolveEditorExtensionsDir(app);
    const entries = readdirSync(extensionsDir);
    return entries.some((entry) => prefixes.some((prefix) => entry.toLowerCase().startsWith(prefix.toLowerCase())));
  } catch {
    return false;
  }
}

export function findExistingDirectory(paths: string[]): string | null {
  for (const candidate of paths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function findLatestFile(rootDir: string, options?: {
  maxDepth?: number;
  includeFile?: (filePath: string) => boolean;
}): { filePath: string; mtimeMs: number } | null {
  try {
    const maxDepth = options?.maxDepth ?? 3;
    const includeFile = options?.includeFile ?? (() => true);
    const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
    let latestPath: string | null = null;
    let latestMtime = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      for (const entry of readdirSync(current.dir, { withFileTypes: true })) {
        const entryPath = join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (current.depth < maxDepth) {
            stack.push({ dir: entryPath, depth: current.depth + 1 });
          }
          continue;
        }

        if (!includeFile(entryPath)) {
          continue;
        }

        const stat = statSync(entryPath);
        if (stat.mtimeMs >= latestMtime) {
          latestMtime = stat.mtimeMs;
          latestPath = entryPath;
        }
      }
    }

    return latestPath ? { filePath: latestPath, mtimeMs: latestMtime } : null;
  } catch {
    return null;
  }
}

export function readFileTail(filePath: string, maxBytes = 65536): string {
  try {
    const stat = statSync(filePath);
    if (stat.size <= 0) {
      return '';
    }

    const readSize = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(readSize);
    const fd = openSync(filePath, 'r');
    readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
    closeSync(fd);
    return buffer.toString('utf-8');
  } catch {
    return '';
  }
}

export function extractSignalStatusFromText(content: string): SignalStatus | null {
  if (!content) {
    return null;
  }

  const directMatch = content.match(/"(?:status|state|phase|signalStatus)"\s*:\s*"(idle|thinking|running|completed|error|waiting_input|stalled)"/i);
  if (directMatch) {
    return directMatch[1].toLowerCase() as SignalStatus;
  }

  const approvalMatch = content.match(/"(?:approval|permission)[^"]*"\s*:\s*"(pending|requested|required|waiting)"/i);
  if (approvalMatch) {
    return 'waiting_input';
  }

  return null;
}

export function querySqliteValue(dbPath: string, key: string): string | null {
  try {
    const stdout = execFileSync('sqlite3', [dbPath, `select value from ItemTable where key = '${key.replaceAll("'", "''")}' limit 1;`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = stdout.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function querySqliteKeys(dbPath: string, whereClause: string, limit = 50): Array<{ key: string; value: string }> {
  try {
    const stdout = execFileSync('sqlite3', ['-separator', '\t', dbPath, `select key, value from ItemTable where ${whereClause} limit ${limit};`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [key, ...valueParts] = line.split('\t');
        return { key, value: valueParts.join('\t') };
      });
  } catch {
    return [];
  }
}

export function parseWorkbenchHiddenState(value: string | null): boolean | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const firstVisible = parsed.find((entry) => entry && typeof entry === 'object' && 'isHidden' in entry);
      if (firstVisible && typeof firstVisible.isHidden === 'boolean') {
        return firstVisible.isHidden;
      }
    }
  } catch {
    // ignore malformed JSON
  }

  return null;
}