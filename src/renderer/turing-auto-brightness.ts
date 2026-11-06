/** Resolve the active Turing backlight level for a local wall-clock time. */
export function getScheduledTuringBrightness(
  now: Date, dayStart: string, nightStart: string, dayBrightness: number, nightBrightness: number,
): number {
  const parse = (value: string, fallback: number) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
    if (!match) return fallback;
    const hour = Number(match[1]), minute = Number(match[2]);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : fallback;
  };
  const dayMinute = parse(dayStart, 8 * 60);
  const nightMinute = parse(nightStart, 20 * 60);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const isDay = dayMinute === nightMinute
    ? true
    : dayMinute < nightMinute
      ? currentMinute >= dayMinute && currentMinute < nightMinute
      : currentMinute >= dayMinute || currentMinute < nightMinute;
  const value = isDay ? dayBrightness : nightBrightness;
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : (isDay ? 70 : 25))));
}
