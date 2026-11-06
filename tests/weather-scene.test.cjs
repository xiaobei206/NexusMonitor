const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyWeatherScene, getWeatherSceneAsset, resolveSolarPhase } = require('../.test-build/renderer/weather-scene.js');

const sunrise = '2026-11-02T06:18:00+08:00';
const sunset = '2026-11-02T17:03:00+08:00';
const at = (time) => new Date(`2026-11-02T${time}+08:00`);

test('weather codes retain independent rain, storm, snow and fog families', () => {
  assert.equal(classifyWeatherScene(61, 14), 'rain');
  assert.equal(classifyWeatherScene(95, 23), 'storm');
  assert.equal(classifyWeatherScene(71, 9), 'snow');
  assert.equal(classifyWeatherScene(45, 11), 'fog');
});

test('sunrise and sunset image windows follow the provider solar times, not fixed clock hours', () => {
  assert.equal(resolveSolarPhase(at('05:40'), sunrise, sunset), 'dawn');
  assert.equal(resolveSolarPhase(at('06:25'), sunrise, sunset), 'sunrise');
  assert.equal(resolveSolarPhase(at('10:00'), sunrise, sunset), 'morning');
  assert.equal(resolveSolarPhase(at('13:00'), sunrise, sunset), 'midday');
  assert.equal(resolveSolarPhase(at('16:00'), sunrise, sunset), 'golden');
  assert.equal(resolveSolarPhase(at('17:15'), sunrise, sunset), 'sunset');
  assert.equal(resolveSolarPhase(at('17:50'), sunrise, sunset), 'twilight');
  assert.equal(resolveSolarPhase(at('23:16'), sunrise, sunset), 'night');
});

test('late-night clear conditions can only select genuinely dark night scenes', () => {
  const asset = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('23:16'));
  assert.match(asset, /sunny-night|weather-moonlit-night/);
  assert.doesNotMatch(asset, /twilight|sunset|golden-hour|river-golden/);
});

test('sunset and twilight artwork are restricted to the actual sunset window', () => {
  const sunsetAsset = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('17:15'));
  const twilightAsset = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('17:50'));
  const nightAsset = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('21:00'));
  assert.match(sunsetAsset, /sunset|mountain-sunset/);
  assert.match(twilightAsset, /sunny-twilight/);
  assert.match(nightAsset, /sunny-night|weather-moonlit-night/);
});

test('scene selection is stable within a time block and uses packaged relative assets', () => {
  const a = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('10:05'));
  const b = getWeatherSceneAsset({ weatherCode: 0, sunrise, sunset }, at('10:10'));
  assert.equal(a, b);
  assert.match(a, /^turing-weather\//);
});

test('all referenced weather background files exist and the inventory is complete', () => {
  const directory = path.join(process.cwd(), 'public', 'turing-weather');
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.webp'));
  assert.equal(files.length, 27);
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'weather-scene.ts'), 'utf8');
  const referenced = [...source.matchAll(/'([a-z0-9-]+\.webp)'/g)].map(match => match[1]);
  assert.ok(referenced.length > 0);
  for (const name of referenced) assert.ok(files.includes(name), `missing scene asset: ${name}`);
  for (const name of files) assert.ok(fs.statSync(path.join(directory, name)).size > 1000, name);
});

test('post-sunset cloud conditions never reuse dusk and sunset artwork', () => {
  for (const code of [0, 1, 2, 3, null]) {
    const asset = getWeatherSceneAsset({ weatherCode: code, sunrise, sunset }, at('19:45'));
    assert.doesNotMatch(asset, /partly-cloudy|broken-clouds|sunset|twilight|golden-hour|river-golden/);
    assert.match(asset, /sunny-night|weather-moonlit-night/);
  }
});

test('night-time rain, storm and snow use night-appropriate artwork', () => {
  assert.equal(getWeatherSceneAsset({ weatherCode: 61, sunrise, sunset }, at('23:16')), 'turing-weather/weather-heavy-rain.webp');
  assert.equal(getWeatherSceneAsset({ weatherCode: 95, sunrise, sunset }, at('23:16')), 'turing-weather/weather-thunderstorm.webp');
  assert.equal(getWeatherSceneAsset({ weatherCode: 71, sunrise, sunset }, at('23:16')), 'turing-weather/weather-moonlit-night.webp');
});

test('daytime overcast scenes do not use the dusk-seascape broken-clouds photo', () => {
  const daytime = getWeatherSceneAsset({ weatherCode: 3, sunrise, sunset }, at('13:00'));
  const evening = getWeatherSceneAsset({ weatherCode: 3, sunrise, sunset }, at('16:00'));
  assert.doesNotMatch(daytime, /broken-clouds|sunset|twilight|golden-hour|river-golden/);
  assert.equal(evening, 'turing-weather/weather-broken-clouds.webp');
});
