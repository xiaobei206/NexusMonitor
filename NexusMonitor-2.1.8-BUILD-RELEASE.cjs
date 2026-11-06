#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate } = require('./scripts/validate-release-version.cjs');

const expectedVersion = '2.1.8';
const projectRoot = __dirname;
process.chdir(projectRoot);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const versionResult = validate(projectRoot);
if (!versionResult.ok || versionResult.expected !== expectedVersion) {
  console.error('Version consistency validation failed:');
  console.error(JSON.stringify(versionResult, null, 2));
  process.exit(1);
}
console.log(`Version consistency validation passed (${Object.keys(versionResult.checks).length} checks): ${expectedVersion}`);
if (process.argv.includes('--validate-only')) {
  console.log('Validation-only mode: no build commands were run.');
  process.exit(0);
}

function run(label, command, args) {
  console.log(`\n========== ${label} ==========`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.signal) fail(`${label} was interrupted by signal ${result.signal}.`);
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status}. Release stopped.`);
}

const modulePath = path.join(projectRoot, 'HardwareService', 'Resources', 'PawnIO', 'IntelMCHBAR.bin');
if (!fs.existsSync(modulePath)) {
  const fetchScript = path.join(projectRoot, 'scripts', 'fetch-mchbar-module.ps1');
  if (!fs.existsSync(fetchScript)) fail('Required PawnIO MCHBAR resource and fetch script are both missing.');
  console.log('\nRequired PawnIO MCHBAR resource is missing; running the existing verified fetch script.');
  run('PawnIO resource preparation', 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fetchScript]);
  if (!fs.existsSync(modulePath)) fail('PawnIO MCHBAR resource preparation did not produce the required file.');
}

run('Main process and Node regression tests', 'npm.cmd', ['run', 'test:main']);
run('Renderer type check and Vite build', 'npm.cmd', ['run', 'build:renderer']);
run('.NET Release build', 'dotnet', ['build', '.\\HardwareService\\HardwareService.csproj', '-c', 'Release']);
run('Storage and hardware tests', 'npm.cmd', ['run', 'test:storage']);
run('Windows installer packaging', 'npm.cmd', ['run', 'package:win']);

const setup = path.join(projectRoot, 'release', `NexusMonitor-${expectedVersion}-Setup.exe`);
if (!fs.existsSync(setup)) fail(`Expected installer was not found: ${setup}`);
const crypto = require('node:crypto');
const hash = crypto.createHash('sha256').update(fs.readFileSync(setup)).digest('hex');
const stat = fs.statSync(setup);
console.log('\nRelease packaging completed.');
console.log(`Installer: ${setup}`);
console.log(`Size: ${stat.size} bytes`);
console.log(`SHA-256: ${hash}`);
