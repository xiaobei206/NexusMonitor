export const HOLIDAY_PARSER_VERSION = 1;

export interface HolidaySchedule {
  year: number;
  source: string;
  publishedAt: string;
  restDays: string[];
  makeUpWorkDays: string[];
  fetchedAt?: string;
  parserVersion?: number;
  provenance?: 'official-parser' | 'ai-search' | 'cache' | 'bundled';
}

export interface HolidayScheduleValidation {
  valid: boolean;
  errors: string[];
  restDayCount: number;
  makeUpWorkDayCount: number;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateKey(year: number, month: number, day: number): string | null {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return validDate(value) ? value : null;
}

function* eachDay(start: string, end: string): Generator<string> {
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function expandHolidayRange(start: string, end: string): string[] {
  if (!validDate(start) || !validDate(end) || start > end) return [];
  return [...eachDay(start, end)];
}

export function validateHolidaySchedule(value: unknown, expectedYear?: number): HolidayScheduleValidation {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['schedule 必须是对象'], restDayCount: 0, makeUpWorkDayCount: 0 };
  }
  const item = value as Partial<HolidaySchedule>;
  if (!Number.isInteger(item.year) || (expectedYear !== undefined && item.year !== expectedYear)) errors.push('年份缺失或不匹配');
  if (typeof item.source !== 'string' || !/^https:\/\//i.test(item.source)) errors.push('缺少来源网址');
  if (typeof item.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt) || !validDate(item.publishedAt)) errors.push('发布日期无效');
  const checkList = (name: 'restDays' | 'makeUpWorkDays') => {
    const values = item[name];
    if (!Array.isArray(values)) { errors.push(`${name} 必须是数组`); return [] as string[]; }
    const seen = new Set<string>();
    for (const entry of values) {
      if (typeof entry !== 'string' || !validDate(entry)) { errors.push(`${name} 存在无效日期：${String(entry)}`); continue; }
      if (seen.has(entry)) errors.push(`${name} 存在重复日期：${entry}`);
      seen.add(entry);
      if (name === 'restDays' && item.year && Number(entry.slice(0, 4)) !== item.year && Math.abs(Number(entry.slice(0, 4)) - item.year) > 1) {
        errors.push(`放假日期超出目标年份范围：${entry}`);
      }
    }
    return [...seen];
  };
  const restDays = checkList('restDays');
  const makeUpWorkDays = checkList('makeUpWorkDays');
  const restSet = new Set(restDays);
  for (const date of makeUpWorkDays) if (restSet.has(date)) errors.push(`放假与补班日期冲突：${date}`);
  if (!restDays.length) errors.push('没有提取到任何放假日期');
  if (restDays.length > 45) errors.push('放假日期数量异常，请检查是否误把普通周末加入');
  if (makeUpWorkDays.length > 30) errors.push('调休上班日期数量异常');
  return { valid: errors.length === 0, errors, restDayCount: restDays.length, makeUpWorkDayCount: makeUpWorkDays.length };
}

function parseDateParts(match: RegExpExecArray, targetYear: number, previousMonth?: number) {
  const year = match[1] ? Number(match[1]) : targetYear;
  const month = match[2] ? Number(match[2]) : previousMonth;
  const day = Number(match[3]);
  if (!month) return null;
  const key = dateKey(year, month, day);
  return key ? { year, month, day, key } : null;
}

function addRange(target: Set<string>, start: string, end: string) {
  for (const day of expandHolidayRange(start, end)) target.add(day);
}

export function normalizeHolidayNoticeText(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u3000\t]+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parses the stable date grammar used by State Council holiday notices.
 * This is deliberately a bounded parser: unknown wording produces no schedule,
 * rather than guessing dates from weekends or prior years.
 */
export function parseHolidayNotice(
  rawText: string,
  year: number,
  source: string,
  publishedAt: string
): { schedule: HolidaySchedule | null; errors: string[]; sections: number } {
  const text = normalizeHolidayNoticeText(rawText);
  const headings = [...text.matchAll(/[一二三四五六七八九十]+、\s*([^:：。]{1,28})[:：]/g)];
  if (headings.length < 5) return { schedule: null, errors: ['未识别到足够的节假日分项标题'], sections: headings.length };

  const restDays = new Set<string>();
  const makeUpWorkDays = new Set<string>();
  const rangePattern = /((?:(\d{4})年)?(\d{1,2})月(\d{1,2})日)(?:\s*[（(][^）)]*[）)])?\s*(?:至|到|—|–|-)\s*((?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日)/g;
  const datePattern = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g;

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const sectionStart = (heading.index ?? 0) + heading[0].length;
    const sectionEnd = index + 1 < headings.length ? (headings[index + 1].index ?? text.length) : text.length;
    const section = text.slice(sectionStart, sectionEnd);
    const covered: Array<[number, number]> = [];

    rangePattern.lastIndex = 0;
    let rangeMatch: RegExpExecArray | null;
    while ((rangeMatch = rangePattern.exec(section))) {
      const after = section.slice(rangeMatch.index + rangeMatch[0].length, rangeMatch.index + rangeMatch[0].length + 24);
      if (!/放假|补休/.test(after)) continue;
      const startYear = rangeMatch[2] ? Number(rangeMatch[2]) : year;
      const startMonth = Number(rangeMatch[3]);
      const startDay = Number(rangeMatch[4]);
      const endYear = rangeMatch[6] ? Number(rangeMatch[6]) : startYear;
      const endMonth = rangeMatch[7] ? Number(rangeMatch[7]) : startMonth;
      const endDay = Number(rangeMatch[8]);
      const start = dateKey(startYear, startMonth, startDay);
      const end = dateKey(endYear, endMonth, endDay);
      if (start && end && start <= end) addRange(restDays, start, end);
      else return { schedule: null, errors: [`无法解析放假日期范围：${rangeMatch[0]}`], sections: headings.length };
      covered.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length]);
    }

    datePattern.lastIndex = 0;
    let dateMatch: RegExpExecArray | null;
    while ((dateMatch = datePattern.exec(section))) {
      if (covered.some(([start, end]) => dateMatch!.index >= start && dateMatch!.index < end)) continue;
      const after = section.slice(dateMatch.index + dateMatch[0].length, dateMatch.index + dateMatch[0].length + 24);
      if (!/放假|补休/.test(after)) continue;
      const parsed = parseDateParts(dateMatch, year);
      if (parsed) restDays.add(parsed.key);
    }

    let workIndex = 0;
    while ((workIndex = section.indexOf('上班', workIndex)) >= 0) {
      const previousStops = [section.lastIndexOf('。', workIndex), section.lastIndexOf(';', workIndex), section.lastIndexOf('；', workIndex)];
      const segmentStart = Math.max(...previousStops) + 1;
      const segment = section.slice(segmentStart, workIndex);
      datePattern.lastIndex = 0;
      let workMatch: RegExpExecArray | null;
      while ((workMatch = datePattern.exec(segment))) {
        const parsed = parseDateParts(workMatch, year);
        if (parsed) makeUpWorkDays.add(parsed.key);
      }
      workIndex += 2;
    }
  }

  const schedule: HolidaySchedule = {
    year,
    source,
    publishedAt,
    restDays: [...restDays].sort(),
    makeUpWorkDays: [...makeUpWorkDays].sort(),
    parserVersion: HOLIDAY_PARSER_VERSION,
    provenance: 'official-parser'
  };
  const validation = validateHolidaySchedule(schedule, year);
  if (!validation.valid) return { schedule: null, errors: validation.errors, sections: headings.length };
  if (headings.length < 6 || makeUpWorkDays.size > 20) {
    return { schedule: null, errors: ['通知结构或调休日期数量超出已验证范围'], sections: headings.length };
  }
  return { schedule, errors: [], sections: headings.length };
}

export function isOfficialScheduleSource(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'gov.cn' || host.endsWith('.gov.cn');
  } catch {
    return false;
  }
}

export function extractScheduleJson(raw: string, expectedYear: number): HolidaySchedule | null {
  const candidates = [String(raw ?? ''), decodeEntities(String(raw ?? ''))];
  for (const candidate of candidates) {
    for (let start = candidate.indexOf('{'); start >= 0; start = candidate.indexOf('{', start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < candidate.length; index++) {
        const char = candidate[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(candidate.slice(start, index + 1)) as HolidaySchedule;
              if (parsed.year !== expectedYear || !isOfficialScheduleSource(parsed.source)) break;
              if (validateHolidaySchedule(parsed, expectedYear).valid) return { ...parsed, provenance: 'ai-search' };
            } catch { /* Continue scanning other JSON-looking blocks. */ }
            break;
          }
        }
      }
    }
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, num: string) => String.fromCharCode(Number(num)));
}
