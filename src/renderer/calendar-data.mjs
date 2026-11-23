import BUILTIN_SCHEDULES from '../shared/calendar-holiday-schedules.json' with { type: 'json' };

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// Government-published mainland China holiday and make-up work schedules.
// Sources: State Council General Office notices for 2025 and 2026.
const scheduleRecords = new Map(Object.entries(BUILTIN_SCHEDULES).map(([year, record]) => [Number(year), record]));
const scheduleStatuses = new Map([...scheduleRecords.keys()].map(year => [year, 'bundled']));
const REST_DAYS = new Set();
const MAKE_UP_WORK_DAYS = new Set();

function expandRange(start, end) {
  const values = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(last.getTime()) || cursor > last) return values;
  while (cursor <= last) {
    values.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return values;
}

function rebuildScheduleDateSets() {
  REST_DAYS.clear();
  MAKE_UP_WORK_DAYS.clear();
  for (const record of scheduleRecords.values()) {
    const days = Array.isArray(record.restDays)
      ? record.restDays
      : Array.isArray(record.restRanges)
        ? record.restRanges.flatMap(([start, end]) => expandRange(start, end))
        : [];
    for (const day of days) REST_DAYS.add(day);
    for (const day of Array.isArray(record.makeUpWorkDays) ? record.makeUpWorkDays : []) MAKE_UP_WORK_DAYS.add(day);
  }
}
rebuildScheduleDateSets();

export function applyCalendarScheduleResult(result) {
  const year = Number(result?.year);
  if (!Number.isInteger(year)) return false;
  const schedule = result?.schedule;
  if (schedule && Number(schedule.year) === year && Array.isArray(schedule.restDays) && Array.isArray(schedule.makeUpWorkDays)) {
    scheduleRecords.set(year, schedule);
  }
  if (typeof result?.status === 'string') scheduleStatuses.set(year, result.status);
  if (schedule) rebuildScheduleDateSets();
  return true;
}

const SOLAR_TERMS = new Map([
  // 2025 solar terms (Beijing dates).
  ['2025-01-05','小寒'],['2025-01-20','大寒'],['2025-02-03','立春'],['2025-02-18','雨水'],
  ['2025-03-05','惊蛰'],['2025-03-20','春分'],['2025-04-04','清明'],['2025-04-20','谷雨'],
  ['2025-05-05','立夏'],['2025-05-21','小满'],['2025-06-05','芒种'],['2025-06-21','夏至'],
  ['2025-07-07','小暑'],['2025-07-22','大暑'],['2025-08-07','立秋'],['2025-08-23','处暑'],
  ['2025-09-07','白露'],['2025-09-23','秋分'],['2025-10-08','寒露'],['2025-10-23','霜降'],
  ['2025-11-07','立冬'],['2025-11-22','小雪'],['2025-12-07','大雪'],['2025-12-21','冬至'],
  // 2026 solar terms (China Standard Time dates).
  ['2026-01-05','小寒'],['2026-01-20','大寒'],['2026-02-04','立春'],['2026-02-18','雨水'],
  ['2026-03-05','惊蛰'],['2026-03-20','春分'],['2026-04-05','清明'],['2026-04-20','谷雨'],
  ['2026-05-05','立夏'],['2026-05-21','小满'],['2026-06-05','芒种'],['2026-06-21','夏至'],
  ['2026-07-07','小暑'],['2026-07-23','大暑'],['2026-08-07','立秋'],['2026-08-23','处暑'],
  ['2026-09-07','白露'],['2026-09-23','秋分'],['2026-10-08','寒露'],['2026-10-23','霜降'],
  ['2026-11-07','立冬'],['2026-11-22','小雪'],['2026-12-07','大雪'],['2026-12-22','冬至'],
  // 2027 solar terms; these are astronomical calendar dates, not holiday arrangements.
  ['2027-01-05','小寒'],['2027-01-20','大寒'],['2027-02-04','立春'],['2027-02-19','雨水'],
  ['2027-03-06','惊蛰'],['2027-03-21','春分'],['2027-04-05','清明'],['2027-04-20','谷雨'],
  ['2027-05-06','立夏'],['2027-05-21','小满'],['2027-06-06','芒种'],['2027-06-21','夏至'],
  ['2027-07-07','小暑'],['2027-07-23','大暑'],['2027-08-08','立秋'],['2027-08-23','处暑'],
  ['2027-09-08','白露'],['2027-09-23','秋分'],['2027-10-08','寒露'],['2027-10-23','霜降'],
  ['2027-11-07','立冬'],['2027-11-22','小雪'],['2027-12-07','大雪'],['2027-12-22','冬至'],
]);

const GREGORIAN_LABELS = new Map([
  ['01-01','元旦'],['02-14','情人节'],['03-08','妇女节'],['03-12','植树节'],['04-01','愚人节'],
  ['05-01','劳动节'],['05-04','青年节'],['06-01','儿童节'],['08-01','建军节'],['09-10','教师节'],
  ['10-01','国庆节'],['10-10','辛亥革命'],['10-31','万圣节'],['11-11','购物节'],['12-24','平安夜'],['12-25','圣诞节'],
]);

const lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
const LUNAR_DAY_NAMES = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

export function calendarDateKey(date) { return dateKey(date); }

export function getLunarParts(date) {
  const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const parts = lunarFormatter.formatToParts(localNoon);
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? NaN);
  const dayLabel = Number.isInteger(day) && day >= 1 && day <= 30 ? LUNAR_DAY_NAMES[day] : '';
  return { month, day, dayLabel, fullLabel: month && dayLabel ? `${month}${dayLabel}` : '农历日期不可用' };
}

function getLunarFestival(month, day, nextParts) {
  if (month === '正月' && day === 1) return '春节';
  if (month === '正月' && day === 15) return '元宵节';
  if (month === '二月' && day === 2) return '龙抬头';
  if (month === '三月' && day === 3) return '上巳节';
  if (month === '四月' && day === 8) return '浴佛节';
  if (month === '五月' && day === 5) return '端午节';
  if (month === '七月' && day === 7) return '七夕';
  if (month === '七月' && day === 15) return '中元节';
  if (month === '八月' && day === 15) return '中秋节';
  if (month === '九月' && day === 9) return '重阳节';
  if (month === '腊月' && day === 8) return '腊八节';
  if (month === '腊月' && (day === 23 || day === 24)) return '小年';
  if (nextParts?.month === '正月' && nextParts?.day === 1) return '除夕';
  return null;
}

export function getCalendarDayInfo(date) {
  const key = dateKey(date);
  const monthDay = key.slice(5);
  const lunar = getLunarParts(date);
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12);
  const nextLunar = getLunarParts(nextDate);
  const isMakeUpWorkday = MAKE_UP_WORK_DAYS.has(key);
  const isRestDay = REST_DAYS.has(key);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const festival = GREGORIAN_LABELS.get(monthDay) ?? getLunarFestival(lunar.month, lunar.day, nextLunar);
  const solarTerm = SOLAR_TERMS.get(key) ?? null;
  const subLabel = festival ?? solarTerm ?? (lunar.day === 1 ? lunar.month : lunar.dayLabel);
  const hasOfficialSchedule = scheduleRecords.has(date.getFullYear());
  const isWeekendOrRest = !isMakeUpWorkday && (isWeekend || isRestDay);
  const status = isMakeUpWorkday ? 'work' : isRestDay ? 'rest' : hasOfficialSchedule ? (isWeekend ? 'weekend' : 'workday') : 'unknown';
  const statusLabel = isMakeUpWorkday ? '调休上班' : isRestDay ? '国务院安排放假' : hasOfficialSchedule ? (isWeekend ? '周末' : '工作日') : '调休安排待公布';
  const labelKind = festival ? 'festival' : solarTerm ? 'solar-term' : 'lunar';
  return {
    key, date, dayNumber: date.getDate(), isMakeUpWorkday, isRestDay, isWeekend,
    isBlueDate: isWeekendOrRest, badge: isMakeUpWorkday ? '班' : isRestDay ? '休' : null,
    status, statusLabel, subLabel, labelKind, lunar, festival, solarTerm,
  };
}

export function buildCalendarMonth(year, monthIndex) {
  const first = new Date(year, monthIndex, 1, 12);
  const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, monthIndex, 1 - mondayOffset + index, 12);
    return { ...getCalendarDayInfo(date), inMonth: date.getMonth() === monthIndex };
  });
}

export function getCalendarScheduleCoverage(year) {
  const status = scheduleStatuses.get(Number(year));
  if (status === 'bundled') return '已内置国务院公布的调休安排';
  if (status === 'cache') return '已获取并缓存官方调休安排';
  if (status === 'pending') return '正在联网查询该年度官方安排…';
  if (status === 'unavailable') return '暂未获取到可核实的官方安排；不推测“休/班”';
  return '该年份的国务院调休安排尚未获取；仅按周末显示蓝色日期';
}
