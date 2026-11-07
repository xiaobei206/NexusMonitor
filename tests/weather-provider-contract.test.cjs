'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const weatherService = read('HardwareService/Monitoring/WeatherService.cs');
const main = read('src/main/index.ts');
const app = read('src/renderer/App.tsx');
const shared = read('src/shared/types.ts');
const turing = read('src/renderer/turing-dashboard.ts');

test('QWeather provider uses V1 endpoints, assigned API Host and Bearer JWT only', () => {
  assert.match(weatherService, /\/weather\/v1\/current\//);
  assert.match(weatherService, /\/weather\/v1\/hourly\//);
  assert.match(weatherService, /\/weather\/v1\/daily\//);
  assert.match(weatherService, /\/airquality\/v1\/current\//);
  assert.match(weatherService, /EndsWith\("\.qweatherapi\.com"/);
  assert.doesNotMatch(weatherService, /devapi\.qweather\.com|\/v7\/weather|\/v7\/air/);
  assert.match(weatherService, /FetchBearerAsync/);
});

test('QWeather JWT is signed locally with Ed25519 and private key is excluded from public settings', () => {
  assert.match(main, /generateKeyPairSync\('ed25519'/);
  assert.match(main, /safeStorage\.encryptString\(pair\.privateKey\)/);
  assert.match(main, /alg: 'EdDSA', kid: config\.credentialId/);
  assert.match(main, /iss: config\.developerId, sub: config\.projectId/);
  assert.match(main, /cryptoSign\(null,/);
  assert.match(main, /await refreshWeather\(true\)/);
  assert.match(main, /delete visible\.qweatherPrivateKeyEncrypted/);
  assert.match(main, /delete visible\.weatherApiSecretsEncrypted/);
  assert.match(weatherService, /new AuthenticationHeaderValue\("Bearer", token\)/);
});

test('WeatherCN standard provider uses supported endpoints, secure API-key headers and cached Location Key', () => {
  assert.match(weatherService, /locations\/v1\/cities\/geoposition\/search\.json\?q=/);
  assert.match(weatherService, /currentconditions\/v1\/\{locationKey\}\.json\?/);
  assert.match(weatherService, /forecasts\/v1\/hourly\/24hour/);
  assert.match(weatherService, /forecasts\/v1\/daily\/10day/);
  assert.match(weatherService, /airquality\/v1\/global\/observations/);
  assert.match(weatherService, /metric=true/);
  assert.match(weatherService, /X-Gw-API-Key/);
  assert.match(weatherService, /AddHours\(24\)/);
  assert.match(weatherService, /if \(!forceRefresh && _cache is not null/);
  assert.match(weatherService, /China-MEP/);
  assert.doesNotMatch(weatherService, /apikey=\{Uri\.EscapeDataString\(apiKey\)\}/);
});

test('Caiyun V2.6 uses one combined weather call with per-request HMAC-SHA256 signature', () => {
  assert.match(weatherService, /\/v2\.6\/\{Uri\.EscapeDataString\(appKey\)\}\/.*\/weather/);
  assert.match(weatherService, /HMACSHA256/);
  assert.match(weatherService, /x-cy-nonce/);
  assert.match(weatherService, /x-cy-timestamp/);
  assert.match(weatherService, /x-cy-signature/);
  assert.match(weatherService, /ToGcj02/);
});

test('settings expose all weather providers and distinguish the AQI standard', () => {
  for (const source of ['open-meteo', 'qweather', 'weathercn', 'caiyun', 'weatherapi', 'openweather']) {
    assert.match(app, new RegExp('value="' + source + '"'));
    assert.match(shared, new RegExp("'" + source + "'"));
  }
  assert.match(app, /weather\?\.aqiStandard === 'China-MEP'/);
  assert.match(app, /数据来源声明/);
});

test('vertical HUD defaults to a balanced 960px and clamps remembered height', () => {
  assert.match(main, /width: 340, height: 960, minWidth: 340, minHeight: 700/);
  assert.match(main, /scheduleWidgetDimensionPersistence/);
  assert.match(read('src/main/widget-docking.ts'), /preferredHeight = orientation === 'vertical' \? Math\.max\(700, Math\.min\(1200, Math\.round\(preferredVerticalHeight\)\)\) : 112/);
});

test('AQI presentation uses Chinese MEP and US EPA labels for the same numeric bands', () => {
  const source = read('src/renderer/aqi.ts');
  assert.match(source, /standard === 'China-MEP'/);
  assert.match(source, /敏感人群不健康/);
  assert.match(source, /value <= 300/);
});

test('Turing 3.5-inch weather clock carries AQI standard and provider attribution', () => {
  assert.match(turing, /aqiLabel\(w\?\.aqi, w\?\.aqiStandard\)/);
  assert.match(turing, /aqi\.standardLabel/);
  assert.match(turing, /天气数据来源：\$\{w\.source\}/);
  assert.doesNotMatch(turing, /fillText\('US AQI'/);
});

test('Open-Meteo is explicitly marked US-EPA and local providers keep China-MEP labels', () => {
  assert.match(weatherService, /D\(air, "us_aqi"\)[\s\S]*"US-EPA"/);
  assert.match(weatherService, /"China-MEP", "https:\/\/platform\.weathercn\.com\//);
  assert.match(weatherService, /N\(aqi, "chn"\) \?\? N\(aqi, "usa"\)/);
});

test('manual weather connection tests bypass cache and do not turn stale data into a pass', () => {
  assert.match(read('HardwareService/Models.cs'), /bool ForceRefresh = false/);
  assert.match(weatherService, /return result \?\? \(!forceRefresh && cacheKey == _cacheKey \? _cache : null\)/);
  assert.match(weatherService, /return !forceRefresh && cacheKey == _cacheKey \? _cache : null/);
});
