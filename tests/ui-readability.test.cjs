const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const musicCss = readFileSync(join(__dirname, '..', 'src', 'renderer', 'music-player.css'), 'utf8');
const main = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
const docking = readFileSync(join(__dirname, '..', 'src', 'main', 'widget-docking.ts'), 'utf8');
const rootLine = css.split(/\r?\n/).find(line => line.startsWith(':root{')) ?? '';

function token(name) {
  const match = rootLine.match(new RegExp(`--${name}:(\\d+(?:\\.\\d+)?)px`));
  return match ? Number(match[1]) : null;
}

test('normal reading tokens are no smaller than the approved minimums', () => {
  assert.equal(token('text-xs'), 12);
  assert.equal(token('text-micro'), 13);
  assert.equal(token('text-meta'), 14);
  assert.equal(token('text-label'), 15);
  assert.equal(token('text-control'), 16);
  assert.equal(token('text-body'), 17);
});

test('navigation and page headings use the larger readability scale', () => {
  assert.equal(token('text-nav'), 17);
  assert.equal(token('text-page'), 34);
});

test('floating HUD labels use readable metadata text instead of micro text', () => {
  assert.match(css, /\.widget-stat>span\{font-size:var\(--text-meta\)/);
  assert.match(css, /\.widget-net\{font:var\(--text-meta\)/);
});


test('vertical HUD defaults to 960px and restores the user's remembered height per display', () => {
  assert.ok(main.includes('width: 340, height: savedHeight, minWidth: 340, minHeight: 700'));
  assert.ok(main.includes('savedPositionRecord.height'));
  assert.ok(main.includes(': 960;'));
  assert.match(main, /scheduleWidgetDimensionPersistence/);
  assert.ok(docking.includes("preferredHeight = orientation === 'vertical' ? Math.max(700, Math.min(1200, Math.round(preferredVerticalHeight))) : 112"));
  assert.match(css, /@media\(max-height:920px\)[\s\S]*?\.widget-shell\.vertical \.widget-vertical-daily\{display:none\}/);
});

test('weather and custom sensor blocks have responsive HUD layouts', () => {
  assert.match(css, /\.widget-weather-detail,\.widget-custom-sensors\{grid-column:span 2/);
  assert.match(css, /\.weather-card\{grid-column:span 2;min-height:242px/);
  assert.match(css, /\.widget-visibility-grid\{display:grid/);
});

test('GPU overview includes power alongside clock and memory', () => {
  assert.match(app, /<span>功耗<\/span><b>\{fmt\(gpu\?\.powerW,1\)\}/);
  assert.match(css, /gpu-numbers\{grid-template-columns:repeat\(4,minmax\(52px,1fr\)\)/);
});

test('estimated CPU clock is clearly marked and never presented as a measured LHM clock', () => {
  assert.match(app, /WindowsPerformanceEstimate/);
  assert.match(app, /不是直接硬件时钟|不是直接硬件测量/);
  assert.match(app, /cpu\.clockSource === 'WindowsPerformanceEstimate' \? '~'/);
});


test('detached detail card has a dedicated larger typography scale without changing compact HUD typography', () => {
  assert.match(css, /\.widget-shell\.detail-only \.widget-panel \{[^}]*font-size:15px/);
  assert.match(css, /\.widget-shell\.detail-only \.widget-detail-values small[^}]*font-size:14px/);
  assert.match(css, /\.widget-shell\.detail-only \.widget-detail-foot \{[^}]*font-size:13px/);
  assert.match(css, /\.widget-shell\.detail-only \.widget-detail-title>strong \{[^}]*font-size:26px/);
});

test('compact HUD clock includes seconds in both horizontal and vertical layouts', () => {
  assert.match(app, /const timeText = localNow\.toLocaleTimeString\('zh-CN', \{[^}]*second: '2-digit'[^}]*hour12: false\s*\}\)/);
  assert.match(app, /<div className="widget-clock"><b>\{timeText\}<\/b>/);
  assert.match(app, /<div className="widget-vertical-clock"><b>\{timeText\}<\/b>/);
});


test('music library and output settings use readable text sizes', () => {
  assert.match(musicCss, /\.nm-track-name b\{font-size:14px/);
  assert.match(musicCss, /\.nm-track-name small,\.nm-track-format\{font-size:12px/);
  assert.match(musicCss, /\.nm-output-device-controls label\{font-size:13px/);
  assert.match(musicCss, /\.nm-library-empty span\{font-size:13px/);
});


