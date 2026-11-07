const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('weather settings expose all six supported providers', () => {
  const app = read('src/renderer/App.tsx');
  const main = read('src/main/index.ts');
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  for (const id of ['open-meteo', 'qweather', 'weathercn', 'caiyun', 'weatherapi', 'openweather']) {
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
  assert.match(main, /delete visible\.weatherApiSecretsEncrypted/);
  assert.match(main, /delete visible\.qweatherPrivateKeyEncrypted/);
  assert.match(main, /app:save-weather-api-key/);
});

test('weather adapters normalize current conditions, hourly forecast, daily forecast and solar times', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  for (const source of ['GetOpenMeteoAsync', 'GetQWeatherAsync', 'GetWeatherCnAsync', 'GetCaiyunAsync', 'GetWeatherApiAsync', 'GetOpenWeatherAsync']) {
    assert.ok(service.includes(source), `missing adapter ${source}`);
  }
  assert.match(service, /hours\.Count < 6/);
  assert.match(service, /days\.Count < 6/);
  assert.match(service, /sunrise, sunset/);
});

test('QWeather adapter uses V1 weather and air-quality APIs instead of legacy V7', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  assert.match(service, /\/weather\/v1\/current\//);
  assert.match(service, /\/weather\/v1\/hourly\//);
  assert.match(service, /\/weather\/v1\/daily\//);
  assert.match(service, /\/airquality\/v1\/current\//);
  assert.doesNotMatch(service, /\/v7\/air\/now/);
});

test('provider credential setup and limits are disclosed in settings', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /QWeather V1/);
  assert.match(app, /Ed25519/);
  assert.match(app, /每日 500 次、5 QPS/);
  assert.match(app, /至少 4 天预报的套餐/);
  assert.match(app, /One Call 3\.0/);
});
