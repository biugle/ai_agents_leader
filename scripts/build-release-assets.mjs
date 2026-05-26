import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const BUNDLE_DIR = join(ROOT_DIR, 'bundle');
const RUNTIME_DIR = join(BUNDLE_DIR, 'runtime');
const OVERLAY_TEMPLATE_DIR = join(BUNDLE_DIR, 'overlay-template');
const OVERLAY_APP_DIR = join(ROOT_DIR, 'apps', 'overlay');

function run(command, args, cwd = ROOT_DIR) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyJsTree(sourceDir, targetDir) {
  ensureDir(targetDir);

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyJsTree(sourcePath, targetPath);
      continue;
    }

    if (entry.name.endsWith('.js')) {
      ensureDir(dirname(targetPath));
      cpSync(sourcePath, targetPath);
    }
  }
}

function rewriteRuntimeImports() {
  const replacements = [
    {
      root: join(RUNTIME_DIR, 'core'),
      from: "'@aal/adapters'",
      to: (filePath) => {
        const relativePath = relative(dirname(filePath), join(RUNTIME_DIR, 'adapters', 'index.js')).replaceAll('\\', '/');
        return `'${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}'`;
      },
    },
    {
      root: join(RUNTIME_DIR, 'core'),
      from: "'@aal/shared'",
      to: (filePath) => {
        const relativePath = relative(dirname(filePath), join(RUNTIME_DIR, 'shared', 'index.js')).replaceAll('\\', '/');
        return `'${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}'`;
      },
    },
    {
      root: join(RUNTIME_DIR, 'adapters'),
      from: "'@aal/shared'",
      to: (filePath) => {
        const relativePath = relative(dirname(filePath), join(RUNTIME_DIR, 'shared', 'index.js')).replaceAll('\\', '/');
        return `'${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}'`;
      },
    },
  ];

  const rewriteRecursive = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const filePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        rewriteRecursive(filePath);
        continue;
      }

      if (!entry.name.endsWith('.js')) {
        continue;
      }

      let content = readFileSync(filePath, 'utf-8');
      for (const replacement of replacements) {
        if (!filePath.startsWith(replacement.root)) {
          continue;
        }
        content = content.replaceAll(replacement.from, replacement.to(filePath));
      }
      writeFileSync(filePath, content);
    }
  };

  rewriteRecursive(RUNTIME_DIR);
}

function copyOverlayTemplate() {
  ensureDir(OVERLAY_TEMPLATE_DIR);

  cpSync(join(OVERLAY_APP_DIR, 'dist'), join(OVERLAY_TEMPLATE_DIR, 'dist'), { recursive: true });

  cpSync(join(OVERLAY_APP_DIR, 'src-tauri'), join(OVERLAY_TEMPLATE_DIR, 'src-tauri'), {
    recursive: true,
    filter: (sourcePath) => {
      const normalized = sourcePath.replaceAll('\\', '/');
      if (normalized.includes('/target/')) {
        return false;
      }
      if (normalized.includes('/gen/schemas/')) {
        return false;
      }
      return true;
    },
  });

  const tauriConfPath = join(OVERLAY_TEMPLATE_DIR, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
  tauriConf.build = {
    frontendDist: '../dist',
  };
  writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`);
}

function writeBundleManifest() {
  const rootPackage = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));
  writeFileSync(
    join(BUNDLE_DIR, 'manifest.json'),
    `${JSON.stringify({ version: rootPackage.version, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function main() {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });

  run('pnpm', ['--filter', '@aal/shared', '--filter', '@aal/adapters', '--filter', '@aal/core', 'run', 'build']);
  run('pnpm', ['--dir', OVERLAY_APP_DIR, 'build']);

  copyJsTree(join(ROOT_DIR, 'packages', 'shared', 'dist'), join(RUNTIME_DIR, 'shared'));
  copyJsTree(join(ROOT_DIR, 'packages', 'adapters', 'dist'), join(RUNTIME_DIR, 'adapters'));
  copyJsTree(join(ROOT_DIR, 'packages', 'core', 'dist'), join(RUNTIME_DIR, 'core'));

  rewriteRuntimeImports();
  copyOverlayTemplate();
  writeBundleManifest();

  if (!existsSync(join(RUNTIME_DIR, 'core', 'cli.js'))) {
    throw new Error('Missing bundled CLI runtime: bundle/runtime/core/cli.js');
  }

  if (!existsSync(join(OVERLAY_TEMPLATE_DIR, 'src-tauri', 'tauri.conf.json'))) {
    throw new Error('Missing packaged overlay template');
  }

  console.log('\nPrepared release assets in bundle/');
}

main();
