const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const helper = readFileSync(join(__dirname, '..', 'src', 'renderer', 'aqi.ts'), 'utf8');
const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const turing = readFileSync(join(__dirname, '..', 'src', 'renderer', 'turing-dashboard.ts'), 'utf8');
const { getAqiPresentation } = require('../.test-build/renderer/aqi.js');

test('shared US AQI helper contains all six EPA breakpoints and familiar colors', () => {
  for (const token of ['value <= 50', 'value <= 100', 'value <= 150', 'value <= 200', 'value <= 300', '#00E400', '#FFFF00', '#FF7E00', '#FF0000', '#8F3F97', '#7E0023']) {
    assert.ok(helper.includes(token), `missing AQI rule: ${token}`);
  }
});

test('overview, both HUD presentations and Turing Canvas use shared AQI presentation', () => {
  assert.match(app, /getAqiPresentation\(weather\?\.aqi, weather\?\.aqiStandard\)/);
  assert.match(turing, /getAqiPresentation\(value, standard\)/);
  assert.match(turing, /CN AQI/);
  assert.match(turing, /aqi\.standardLabel/);
  assert.match(app, /className="aqi-reading"/);
  assert.match(app, /className="aqi-inline"/);
  assert.match(turing, /import \{ getAqiPresentation \} from '\.\/aqi'/);
});


test('shared AQI resolver returns the correct color band at every boundary', () => {
  const cases = [
    [0, '优', '#00E400'], [50, '优', '#00E400'],
    [51, '良', '#FFFF00'], [100, '良', '#FFFF00'],
    [101, '轻度污染', '#FF7E00'], [150, '轻度污染', '#FF7E00'],
    [151, '中度污染', '#FF0000'], [200, '中度污染', '#FF0000'],
    [201, '重度污染', '#8F3F97'], [300, '重度污染', '#8F3F97'],
    [301, '严重污染', '#7E0023'], [500, '严重污染', '#7E0023'],
  ];
  for (const [value, label, color] of cases) {
    const result = getAqiPresentation(value, 'China-MEP');
    assert.equal(result.label, label, `China AQI ${value}`);
    assert.equal(result.color, color, `AQI ${value}`);
  }
  assert.equal(getAqiPresentation(null).label, '—');
  assert.equal(getAqiPresentation(101, 'US-EPA').label, '敏感人群不健康');
  assert.equal(getAqiPresentation(201, 'US-EPA').label, '非常不健康');
});
