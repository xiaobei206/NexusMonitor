const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

if (process.platform !== 'win32') {
  console.log('[wasapi] native WASAPI addon is Windows-only; skipping on this platform.');
  process.exit(0);
}

const root = process.cwd();
const addonDir = join(root, 'native', 'wasapi-output');
const builtAddon = join(addonDir, 'build', 'Release', 'nexus_wasapi.node');
const command = 'npx.cmd';
const args = ['--yes', 'node-gyp@11.2.0', 'rebuild'];

console.log('[wasapi] building Windows N-API 8 addon with node-gyp 11.2.0');
const result = spawnSync(command, args, {
  cwd: addonDir,
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(builtAddon)) {
  throw new Error(`node-gyp completed without creating ${builtAddon}`);
}
console.log('[wasapi] compiled:', builtAddon);
