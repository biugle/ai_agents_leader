#!/usr/bin/env node
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const removed = [];

walk(rootDir);

console.log(`Removed ${removed.length} paths.`);
for (const entry of removed) {
  console.log(`- ${entry}`);
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.git') continue;

    const fullPath = join(dir, entry.name);
    if (entry.name === 'node_modules') {
      removeIfExists(fullPath);
      continue;
    }

    walk(fullPath);
  }
}

function removeIfExists(target) {
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
  removed.push(target.replace(`${rootDir}/`, ''));
}
