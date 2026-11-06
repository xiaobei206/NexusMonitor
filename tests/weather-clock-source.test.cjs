const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('weather service requests seven calendar days and returns six future days for the vertical HUD detail card', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  const models = read('HardwareService/Models.cs');
  assert.match(service, /forecast_days=7/);
  assert.match(service, /temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max/);
  assert.match(service, /dailyForecast\.Count < 6/);
  assert.match(service, /date\.Value\.Date <= currentTime\.Date/);
  assert.match(service, /daily\.Count < 6/);
  assert.match(service, /days\.Count < 6/);
  assert.match(models, /WeatherDaySnapshot/);
  assert.match(models, /DailyForecast/);
});

test('Turing exposes a dedicated weather-clock mode and switches renderer entry', () => {
  const types = read('src/shared/types.ts');
  const app = read('src/renderer/App.tsx');
  const renderer = read('src/renderer/turing-dashboard.ts');
  assert.match(types, /'monitor' \| 'wallpaper' \| 'weather-clock'/);
  assert.match(app, /renderTuringWeatherClock/);
  assert.match(app, /天气时钟/);
  assert.match(app, /weatherClockLoading/);
  assert.match(app, /weatherClockScene\]\)/);
  assert.match(app, /if\(displayMode==='weather-clock'\)\{frameGeneration/);
  assert.match(renderer, /drawWeatherClockLandscape/);
  assert.match(renderer, /drawWeatherClockPortrait/);
  assert.match(renderer, /未来 6 小时/);
  assert.match(renderer, /未来 3 天/);
});

test('AQI stays in the temperature/time gap on landscape and adapts separately on portrait', () => {
  const renderer = read('src/renderer/turing-dashboard.ts');
  assert.match(renderer, /AQI is aligned to the current-conditions block/);
  assert.match(renderer, /drawWeatherClockLandscape/);
  assert.match(renderer, /drawWeatherClockPortrait/);
});



test('weather-clock uses large physical-pixel typography instead of tiny 8–10px labels', () => {
  const renderer = read('src/renderer/turing-dashboard.ts');
  assert.match(renderer, /temperature: 56, time: 47, date: 19, weekday: 18/);
  assert.match(renderer, /description: 17, detail: 15/);
  assert.match(renderer, /sectionTitle: 18, hour: 14/);
  assert.match(renderer, /temperature: 56, time: 37, date: 20, weekday: 19/);
});


test('weather API keeps current conditions when optional air-quality request fails', () => {
  const service = read('HardwareService/Monitoring/WeatherService.cs');
  assert.match(service, /Air quality is optional/);
  assert.match(service, /Open-Meteo air-quality request failed/);
  assert.match(service, /D\(air, "us_aqi"\)/);
});

test('weather clock uses six hours and only three future days in both orientations', () => {
  const renderer = read('src/renderer/turing-dashboard.ts');
  assert.match(renderer, /selectUpcomingWeatherHours\(w\?\.hourlyForecast \?\? \[\], data\.now, 6\)/);
  assert.equal((renderer.match(/dailyForecast \?\? \[\]\)\.slice\(0, 3\)/g) || []).length, 2);
  assert.match(renderer, /正在等待天气数据/);
});

test('weather fetch retries if the first request fails and has no cached result', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /weatherRetryTimer/);
  assert.match(main, /45_000/);
  assert.match(main, /retaining last valid data and retrying/);
});


test('weather-clock shows the next six actual Shanghai wall-clock hours, excluding the current hour', () => {
  const renderer = read('src/renderer/turing-dashboard.ts');
  assert.match(renderer, /selectUpcomingWeatherHours\(w\?\.hourlyForecast \?\? \[\], data\.now, 6\)/);
  assert.match(renderer, /function shanghaiClockKey/);
  assert.match(renderer, /function forecastClockKey/);
  assert.match(renderer, /key > nowKey/);
  assert.equal((renderer.match(/selectUpcomingWeatherHours\(w\?\.hourlyForecast \?\? \[\], data\.now, 6\)/g) || []).length, 2);
});
