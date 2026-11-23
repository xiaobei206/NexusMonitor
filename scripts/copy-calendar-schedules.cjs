#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'shared', 'calendar-holiday-schedules.json');
const destination = path.join(root, 'dist-electron', 'shared', 'calendar-holiday-schedules.json');

if (!fs.existsSync(source)) {
  throw new Error(`Bundled calendar schedule data is missing: ${source}`);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('Copied built-in holiday schedules into dist-electron/shared.');
