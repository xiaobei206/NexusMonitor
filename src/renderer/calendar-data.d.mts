export interface LunarParts { month: string; day: number; dayLabel: string; fullLabel: string; }
export interface CalendarDayInfo {
  key: string; date: Date; dayNumber: number; isMakeUpWorkday: boolean; isRestDay: boolean; isWeekend: boolean;
  isBlueDate: boolean; badge: '班' | '休' | null; status: 'work' | 'rest' | 'weekend' | 'workday' | 'unknown';
  statusLabel: string; subLabel: string; labelKind: 'festival' | 'solar-term' | 'lunar';
  lunar: LunarParts; festival: string | null; solarTerm: string | null; inMonth?: boolean;
}
export function calendarDateKey(date: Date): string;
export function getLunarParts(date: Date): LunarParts;
export function getCalendarDayInfo(date: Date): CalendarDayInfo;
export function buildCalendarMonth(year: number, monthIndex: number): CalendarDayInfo[];
export function getCalendarScheduleCoverage(year: number): string;
