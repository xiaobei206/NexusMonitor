#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasApiVersion(source, expected) {
  const matches = [...source.matchAll(/\bversion\s*=\s*["']([^"']+)["']/gi)];
  return matches.length > 0 && matches.every((match) => match[1] === expected);
}

function validate(projectRoot = process.cwd()) {
  const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
  const expected = read('VERSION').trim();
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const csproj = read('HardwareService/HardwareService.csproj');
  const serviceApi = read('HardwareService/Program.cs');
  const serviceSnapshot = read('HardwareService/Monitoring/HardwareMonitor.cs');
  const renderer = read('src/renderer/App.tsx');
  const releasePath = `NexusMonitor-${expected}-BUILD-RELEASE.cjs`;
  const release = read(releasePath);
  const releaseBytes = fs.readFileSync(path.join(projectRoot, releasePath));
  const escaped = escapeRegExp(expected);
  const cs = (tag, value) => new RegExp(`<${tag}>\\s*${escapeRegExp(value)}\\s*</${tag}>`).test(csproj);
  const serviceInfo = new RegExp(`new\\s+ServiceInfo\\([^\\n]*["']${escaped}["']`).test(serviceSnapshot);
  const checks = {
    packageJson: pkg.version === expected,
    lockfile: lock.version === expected,
    lockRoot: Boolean(lock.packages && lock.packages[''] && lock.packages[''].version === expected),
    versionFile: Boolean(expected) && read('VERSION').trim() === expected,
    serviceVersion: cs('Version', expected),
    serviceAssemblyVersion: cs('AssemblyVersion', `${expected}.0`),
    serviceFileVersion: cs('FileVersion', `${expected}.0`),
    serviceInformationalVersion: cs('InformationalVersion', expected),
    serviceApi: hasApiVersion(serviceApi, expected),
    serviceSnapshot: serviceInfo,
    rendererSidebar: renderer.includes(`<span>${expected}</span>`),
    rendererAbout: renderer.includes(`NexusMonitor ${expected}`),
    releaseEntrypointVersion: release.includes(`const expectedVersion = '${expected}'`),
    releaseEntrypointAscii: releaseBytes.every((byte) => byte < 0x80),
  };
  return { expected, checks, ok: Object.values(checks).every(Boolean) };
}

if (require.main === module) {
  try {
    const result = validate();
    if (!result.ok) {
      console.error('Version consistency validation failed.');
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    } else {
      console.log(`Version consistency validation passed: all ${Object.keys(result.checks).length} checks = ${result.expected}`);
    }
  } catch (error) {
    console.error('Version validation could not complete:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { hasApiVersion, validate };
