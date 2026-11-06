import type { WeatherSnapshot } from '../shared/types';

export type WeatherSceneKind = 'sunny' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow' | 'night';
type SolarPhase = 'dawn' | 'sunrise' | 'morning' | 'midday' | 'afternoon' | 'golden' | 'sunset' | 'twilight' | 'night';

// Each asset has been visually reviewed against the bundled contact sheet.
// Sunset/twilight photos are deliberately excluded from all night pools.
const SUNNY: Record<SolarPhase, string[]> = {
  dawn: ['sunny-dawn.webp', 'sunny-misty-dawn.webp'],
  sunrise: ['sunny-morning.webp', 'sunny-sunrise-hills.webp'],
  morning: ['sunny-late-morning.webp', 'sunny-coast-day.webp'],
  midday: ['sunny-midday.webp', 'sunny-noon.webp', 'sunny-wildflower-noon.webp', 'sunny-alpine-day.webp'],
  afternoon: ['sunny-afternoon.webp', 'sunny-park-afternoon.webp'],
  golden: ['sunny-golden-hour.webp', 'sunny-river-golden-hour.webp'],
  sunset: ['sunny-sunset.webp', 'sunny-mountain-sunset.webp'],
  twilight: ['sunny-twilight.webp'],
  night: ['sunny-night.webp', 'weather-moonlit-night.webp'],
};
const WEATHER: Record<Exclude<WeatherSceneKind, 'sunny' | 'night'>, string[]> = {
  'partly-cloudy': ['weather-partly-cloudy.webp'],
  cloudy: ['weather-broken-clouds.webp'],
  fog: ['weather-fog.webp'],
  rain: ['weather-light-rain.webp', 'weather-heavy-rain.webp'],
  storm: ['weather-thunderstorm.webp'],
  snow: ['weather-snowfall.webp', 'weather-snowy-clear.webp'],
};

export function classifyWeatherScene(code: number | null | undefined, hour: number): WeatherSceneKind {
  if (code != null && code >= 95) return 'storm';
  if (code != null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return 'snow';
  if (code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))) return 'rain';
  if (code != null && (code === 45 || code === 48)) return 'fog';
  if (hour < 5 || hour >= 20) return 'night';
  if (code == null) return 'partly-cloudy';
  if (code === 0) return 'sunny';
  if (code <= 2) return 'partly-cloudy';
  return 'cloudy';
}

function parseSolarTime(value: string | null | undefined, fallback: Date): Date {
  if (value) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return fallback;
}

/** Determine image time from the actual local sunrise/sunset returned by the selected weather source. */
export function resolveSolarPhase(now: Date, sunriseValue?: string | null, sunsetValue?: string | null): SolarPhase {
  const fallbackSunrise = new Date(now); fallbackSunrise.setHours(6, 0, 0, 0);
  const fallbackSunset = new Date(now); fallbackSunset.setHours(18, 0, 0, 0);
  const sunrise = parseSolarTime(sunriseValue, fallbackSunrise);
  const sunset = parseSolarTime(sunsetValue, fallbackSunset);
  const minute = now.getTime() / 60_000;
  const rise = sunrise.getTime() / 60_000;
  const set = sunset.getTime() / 60_000;

  if (minute < rise - 45 || minute >= set + 85) return 'night';
  if (minute < rise - 8) return 'dawn';
  if (minute <= rise + 42) return 'sunrise';
  if (minute >= set + 35 && minute < set + 85) return 'twilight';
  if (minute >= set - 28 && minute < set + 35) return 'sunset';
  if (minute >= set - 90 && minute < set - 28) return 'golden';

  const daylightProgress = Math.max(0, Math.min(1, (minute - rise) / Math.max(1, set - rise)));
  if (daylightProgress < 0.38) return 'morning';
  if (daylightProgress < 0.72) return 'midday';
  if (daylightProgress < 0.91) return 'afternoon';
  return 'golden';
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return (hash >>> 0) % length;
}

/** Deterministic scene selection; sunset artwork is only eligible close to the actual sunset. */
export function getWeatherSceneAsset(
  weather: Pick<WeatherSnapshot, 'weatherCode' | 'sunrise' | 'sunset'> | null,
  now: Date,
): string {
  const code = weather?.weatherCode ?? null;
  const phase = resolveSolarPhase(now, weather?.sunrise, weather?.sunset);
  const kind = classifyWeatherScene(code, now.getHours());
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const block = Math.floor(now.getTime() / (3 * 60 * 60 * 1000));
  const pick = (list: string[], key: string) => list[stableIndex(key, list.length)];

  // Real solar time takes precedence over weather-category artwork. Some of the
  // bundled "partly cloudy" and "broken clouds" photos are visibly sunset scenes.
  // They must never leak into the night window merely because the weather is cloudy.
  if (phase === 'night') {
    if (kind === 'storm') return 'turing-weather/weather-thunderstorm.webp';
    if (kind === 'rain') return 'turing-weather/weather-heavy-rain.webp';
    if (kind === 'snow') return 'turing-weather/weather-moonlit-night.webp';
    if (kind === 'fog') return 'turing-weather/weather-fog.webp';
    return `turing-weather/${pick(SUNNY.night, `${dateKey}:${block}:night:${code ?? 'na'}`)}`;
  }

  if (kind === 'sunny' || kind === 'night') {
    return `turing-weather/${pick(SUNNY[phase], `${dateKey}:${block}:${phase}:${code ?? 'na'}`)}`;
  }
  if (kind === 'partly-cloudy') {
    // This particular artwork is a sunset lake, not a general daytime cloud photo.
    if (phase === 'golden' || phase === 'sunset' || phase === 'twilight') return 'turing-weather/weather-partly-cloudy.webp';
    return `turing-weather/${pick(SUNNY[phase], `${dateKey}:${block}:${phase}:partly-cloudy`)}`;
  }
  if (kind === 'cloudy') {
    // The bundled broken-clouds photo is a dusk seascape, not a neutral cloud
    // scene. Use it only around actual golden-hour/sunset; daytime uses a
    // matching daylight landscape instead of showing a false sunset.
    if (phase === 'golden' || phase === 'sunset' || phase === 'twilight') {
      return 'turing-weather/weather-broken-clouds.webp';
    }
    return `turing-weather/${pick(SUNNY[phase], `${dateKey}:${block}:${phase}:cloudy`)}`;
  }
  const list = WEATHER[kind];
  return `turing-weather/${pick(list, `${kind}:${dateKey}:${block}`)}`;
}
