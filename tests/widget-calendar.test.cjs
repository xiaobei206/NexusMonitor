const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('MIUI-style October 2026 calendar uses the official rest/work marks and Chinese lunar labels', async () => {
  const calendar = await import(pathToFileURL(path.join(root, 'src/renderer/calendar-data.mjs')).href);
  const october = calendar.buildCalendarMonth(2026, 9);
  const day = (n) => october.find(item => item.inMonth && item.dayNumber === n);
  assert.equal(day(1).badge, '休');
  assert.equal(day(1).isBlueDate, true);
  assert.equal(day(1).subLabel, '国庆节');
  assert.equal(day(2).lunar.day, 22);
  assert.equal(day(2).subLabel, '廿二');
  assert.equal(day(7).badge, '休');
  assert.equal(day(8).subLabel, '寒露');
  assert.equal(day(8).badge, null);
  assert.equal(day(10).badge, '班');
  assert.equal(day(10).isBlueDate, false, 'make-up Saturday must use the normal white workday date color');
  assert.equal(day(10).subLabel, '辛亥革命');
  assert.equal(day(11).isBlueDate, true);
  assert.equal(day(11).badge, null);
  assert.equal(day(18).subLabel, '重阳节');
  assert.equal(day(31).subLabel, '万圣节');
});

test('calendar grid starts on Monday, supports adjacent-month dates and does not invent schedules for unlisted years', async () => {
  const calendar = await import(pathToFileURL(path.join(root, 'src/renderer/calendar-data.mjs')).href);
  const october = calendar.buildCalendarMonth(2026, 9);
  assert.equal(october[0].date.getFullYear(), 2026);
  assert.equal(october[0].date.getMonth(), 8);
  assert.equal(october[0].dayNumber, 28);
  assert.equal(october[3].dayNumber, 1);
  assert.match(calendar.getCalendarScheduleCoverage(2027), /尚未内置/);
  const unknownWeekday = calendar.getCalendarDayInfo(new Date(2027, 0, 4, 12));
  assert.equal(unknownWeekday.badge, null);
  assert.equal(unknownWeekday.status, 'unknown');
  assert.equal(unknownWeekday.statusLabel, '调休安排待公布');
  const unknownWeekend = calendar.getCalendarDayInfo(new Date(2027, 0, 2, 12));
  assert.equal(unknownWeekend.isBlueDate, true, 'weekend remains blue as a calendar weekday marker');
  assert.equal(unknownWeekend.badge, null, 'no unannounced rest badge is invented');
  assert.equal(unknownWeekend.status, 'unknown', 'do not claim a future weekend is a confirmed rest day');
  assert.equal(calendar.getCalendarDayInfo(new Date(2026, 9, 10, 12)).badge, '班');
});

test('calendar day badge is absolutely positioned and cannot shift the centered date number', () => {
  const css = read('src/renderer/widget-calendar.css');
  assert.match(css, /\.calendar-day\s*\{[^}]*position:\s*relative/s);
  assert.match(css, /\.calendar-day-badge\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.calendar-day-badge\s*\{[^}]*width:\s*15px/s);
  assert.match(css, /\.calendar-day-number\s*\{[^}]*display:\s*grid/s);
});

test('calendar is a separate pop-out renderer route with a close action and month navigation', () => {
  const main = read('src/renderer/main.tsx');
  const preload = read('src/preload/index.ts');
  const process = read('src/main/index.ts');
  const view = read('src/renderer/widget-calendar.tsx');
  assert.match(main, /widget-calendar/);
  assert.match(preload, /openWidgetCalendar/);
  assert.match(preload, /closeWidgetCalendar/);
  assert.match(process, /function openWidgetCalendar\(\)/);
  assert.match(process, /widget:open-calendar/);
  assert.match(view, /changeMonth\(-1\)/);
  assert.match(view, /changeMonth\(1\)/);
  assert.match(view, /goToday/);
});
