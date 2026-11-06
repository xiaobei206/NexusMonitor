const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const expected = read('VERSION').trim();
const releaseName = `NexusMonitor-${expected}-BUILD-RELEASE.cjs`;
const { hasApiVersion, validate } = require('../scripts/validate-release-version.cjs');

test('current version agrees across package, lockfile, VERSION, UI and HardwareService', () => {
  const result = validate(root);
  assert.equal(result.expected, expected);
  assert.deepEqual(Object.entries(result.checks).filter(([, passed]) => !passed), []);
  assert.equal(result.ok, true);
});

test('service API version validation accepts valid C# whitespace and casing variations', () => {
  assert.equal(hasApiVersion(`version="${expected}"`, expected), true);
  assert.equal(hasApiVersion(`version = "${expected}"`, expected), true);
  assert.equal(hasApiVersion(`version= '${expected}'`, expected), true);
  assert.equal(hasApiVersion(`Version = "${expected}"`, expected), true);
  assert.equal(hasApiVersion('version="0.0.0"', expected), false);
  assert.equal(hasApiVersion('no version property here', expected), false);
});

test('versioned Node release entry point uses ASCII-only source and avoids PowerShell encoding/policy failures', () => {
  const bytes = fs.readFileSync(path.join(root, releaseName));
  assert.ok(bytes.length > 0);
  assert.ok(bytes.every((byte) => byte < 0x80), 'release entry point must contain only ASCII bytes');
  assert.equal(fs.existsSync(path.join(root, `BUILD-RELEASE-${expected}.ps1`)), false,
    'no PowerShell release entry point should be shipped');
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [releaseName, '--validate-only'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Version consistency validation passed/);
});
