const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('Turing page controller stays mounted when another main page is selected', () => {
  assert.match(app, /<div className=\{`turing-background-host \$\{page === 'turing' \? 'active' : 'inactive'\}`\} aria-hidden=\{page !== 'turing'\}>\s*<TuringPage/);
  assert.doesNotMatch(app, /\{page\s*===\s*'turing'\s*&&\s*<TuringPage/);
  assert.match(css, /\.turing-background-host\.active\s*\{\s*display:\s*contents\s*\}/);
  assert.match(css, /\.turing-background-host\.inactive\s*\{\s*display:\s*none\s*\}/);
});

test('Turing serial status is refreshed on page activation without unmounting its refresh loop', () => {
  assert.match(app, /function TuringPage\(\{settings,updateSettings,snapshot,weather,notify,active,settingsLoaded,serviceReady\}:any\)/);
  assert.match(app, /if\(!active\)return;[\s\S]*getTuringDevices\(\)/);
  assert.match(app, /if\(!status\.connected\)\{previousFrame\.current=null;return;\}[\s\S]*window\.setTimeout\(async\(\)=>/);
  assert.match(app, /\[status\.connected,snapshot,weather,settings\.turingOrientation/);
  assert.match(app, /if\(!active\)return;[\s\S]*previewCanvasRef\.current[\s\S]*\[active,snapshot,weather/);
  assert.doesNotMatch(app, /if\(!active\)return;[\s\S]{0,120}if\(!status\.connected\)/);
});
