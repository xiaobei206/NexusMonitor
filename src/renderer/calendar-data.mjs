const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// Government-published mainland China holiday and make-up work schedules.
// Sources: State Council General Office notices for 2025 and 2026.
const REST_DAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-01-28','2025-01-29','2025-01-30','2025-01-31','2025-02-01','2025-02-02','2025-02-03','2025-02-04',
  '2025-04-04','2025-04-05','2025-04-06',
  '2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-05',
  '2025-05-31','2025-06-01','2025-06-02',
  '2025-10-01','2025-10-02','2025-10-03','2025-10-04','2025-10-05','2025-10-06','2025-10-07','2025-10-08',
  // 2026
  '2026-01-01','2026-01-02','2026-01-03',
  '2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22','2026-02-23',
  '2026-04-04','2026-04-05','2026-04-06',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
  '2026-06-19','2026-06-20','2026-06-21',
  '2026-09-25','2026-09-26','2026-09-27',
  '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07',
]);
const MAKE_UP_WORK_DAYS = new Set([
  '2025-01-26','2025-02-08','2025-04-27','2025-09-28','2025-10-11',
  '2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10',
]);

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
  const hasOfficialSchedule = key.startsWith('2025-') || key.startsWith('2026-');
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
  if (year === 2025 || year === 2026) return '已内置国务院公布的调休安排';
  if (year >= 2027) return '2027年及以后：尚未内置国务院年度调休安排，不推测“休/班”';
  return '该年份的国务院调休安排未内置；仅按周末显示蓝色日期，不推测“休/班”';
}
