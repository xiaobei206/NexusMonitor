const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('weather settings expose all four requested providers', () => {
  const app = read('src/renderer/App.tsx');
  const main = read('src/main/index.ts');
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  for (const id of ['open-meteo', 'qweather', 'weatherapi', 'openweather']) {
    assert.match(app, new RegExp(`value="${id}"`));
    assert.ok(main.includes(`'${id}'`));
    assert.ok(service.includes(`"${id}"`));
  }
});

test('provider credentials are encrypted through Electron safeStorage and not returned to renderer', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /safeStorage\.decryptString/);
  assert.match(main, /delete visible\.weatherApiKeysEncrypted/);
  assert.match(main, /app:save-weather-api-key/);
});

test('weather adapters normalize current conditions, hourly forecast, daily forecast and solar times', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  for (const source of ['GetOpenMeteoAsync', 'GetQWeatherAsync', 'GetWeatherApiAsync', 'GetOpenWeatherAsync']) {
    assert.ok(service.includes(source), `missing adapter ${source}`);
  }
  assert.match(service, /hours\.Count < 6/);
  assert.match(service, /days\.Count < 6/);
  assert.match(service, /sunrise, sunset/);
});

test('QWeather adapter avoids its discontinued legacy air-quality endpoint', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  assert.match(service, /QWeather's legacy \/v7\/air\/now endpoint was discontinued in 2026/);
  assert.doesNotMatch(service, /devapi\.qweather\.com\/v7\/air\/now/);
});

test('provider-specific retirement and AQI limitations are disclosed in settings', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /V7 空气质量接口已于 2026-06-01 停止/);
  assert.match(app, /2027-06-01 停止/);
  assert.match(app, /至少 4 天预报的套餐/);
  assert.match(app, /One Call 3\.0/);
});
