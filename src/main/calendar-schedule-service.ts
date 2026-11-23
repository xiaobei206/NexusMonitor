import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expandHolidayRange, extractScheduleJson, isOfficialScheduleSource,
  parseHolidayNotice, validateHolidaySchedule
} from '../shared/calendar-holiday-parser';
import type { HolidaySchedule } from '../shared/calendar-holiday-parser';

interface BundledScheduleRecord {
  source: string;
  publishedAt: string;
  restRanges: Array<[string, string]>;
  makeUpWorkDays: string[];
}
interface ScheduleResult {
  year: number;
  status: 'bundled' | 'cache' | 'pending' | 'unavailable';
  schedule: Record<string, unknown> | null;
  message?: string;
}
type LogFn = (message: string) => void;

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const CACHE_REFRESH_MS = 45 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 NexusMonitor/2.2.11';

function decodeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, num: string) => String.fromCharCode(Number(num)));
}

function htmlToText(html: string): string {
  return decodeHtml(String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\u00a0\u3000\t]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractLinks(html: string, baseUrl: string, year: number): string[] {
  const results = new Set<string>();
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const title = htmlToText(match[2]).replace(/\s+/g, '');
    if (!title.includes(String(year)) || !/节假日安排/.test(title)) continue;
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl);
      if (isOfficialScheduleSource(url.href) && !/policyDocumentLibrary|search/i.test(url.pathname)) results.add(url.href);
    } catch { /* Ignore malformed search-result links. */ }
  }
  return [...results].slice(0, 5);
}

function publicationDateFromText(text: string): string | null {
  const patterns = [
    /国务院办公厅\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
    /发布日期\s*[：:]?\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }
  return null;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.text();
}

function buildAiSearchPrompt(year: number): string {
  return `请联网搜索并核实中国国务院公布的 ${year} 年节假日和调休安排，将结果整理成可供软件直接导入的 JSON 数据。请自行寻找最权威、最新的官方来源，阅读相关内容，提取全年所有明确公布的放假日期和调休上班日期。放假日期须展开到每天，普通周末不要混入放假列表，调休上班日不能遗漏。请只输出合法 JSON，不要添加 Markdown 或解释。格式：{"year":${year},"source":"官方来源完整网址","publishedAt":"YYYY-MM-DD","restDays":["YYYY-MM-DD"],"makeUpWorkDays":["YYYY-MM-DD"]}。确保日期完整、没有重复或冲突。以官方公布的信息为准，不要推测尚未公布的安排；找不到官方依据时不要编造。`;
}

export class CalendarScheduleService {
  private readonly cacheDirectory: string;
  private readonly bundled: Record<string, BundledScheduleRecord>;
  private readonly log: LogFn;
  private readonly retryAt = new Map<number, number>();
  private readonly inFlight = new Map<number, Promise<ScheduleResult>>();

  constructor(cacheDirectory: string, bundledDataPath: string, log: LogFn) {
    this.cacheDirectory = cacheDirectory;
    this.log = log;
    try {
      this.bundled = JSON.parse(readFileSync(bundledDataPath, 'utf8')) as Record<string, BundledScheduleRecord>;
    } catch (error) {
      this.log(`[calendar] Built-in schedule data could not be loaded: ${String(error)}`);
      this.bundled = {};
    }
    mkdirSync(this.cacheDirectory, { recursive: true });
  }

  private cachePath(year: number): string {
    return join(this.cacheDirectory, `${year}.json`);
  }

  private readCache(year: number): Record<string, unknown> | null {
    const path = this.cachePath(year);
    if (!existsSync(path)) return null;
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      if (!validateHolidaySchedule(value, year).valid || !isOfficialScheduleSource(String(value.source ?? ''))) {
        this.log(`[calendar] Ignoring invalid local schedule cache for ${year}`);
        return null;
      }
      return { ...value, provenance: 'cache' };
    } catch (error) {
      this.log(`[calendar] Cannot read local schedule cache for ${year}: ${String(error)}`);
      return null;
    }
  }

  private bundledSchedule(year: number): Record<string, unknown> | null {
    const record = this.bundled[String(year)];
    if (!record || !Array.isArray(record.restRanges) || !Array.isArray(record.makeUpWorkDays)) return null;
    const restDays = [...new Set(record.restRanges.flatMap(range => expandHolidayRange(range[0], range[1])))].sort();
    const schedule = {
      year, source: record.source, publishedAt: record.publishedAt, restDays,
      makeUpWorkDays: record.makeUpWorkDays, provenance: 'bundled'
    };
    return validateHolidaySchedule(schedule, year).valid ? schedule : null;
  }

  getSchedule(year: number): ScheduleResult {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return { year, status: 'unavailable', schedule: null, message: '年份超出支持范围' };
    }
    const cached = this.readCache(year);
    if (cached) return { year, status: 'cache', schedule: cached };
    const bundled = this.bundledSchedule(year);
    if (bundled) return { year, status: 'bundled', schedule: bundled };
    return { year, status: 'pending', schedule: null, message: '正在查找官方年度安排' };
  }

  async ensureSchedule(year: number): Promise<ScheduleResult> {
    const current = this.getSchedule(year);
    if (current.schedule) {
      if (current.status === 'bundled') return current;
      const fetchedAt = Date.parse(String(current.schedule.fetchedAt ?? ''));
      if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_REFRESH_MS) return current;
      if (year <= new Date().getFullYear()) return current;
    }
    const retry = this.retryAt.get(year) ?? 0;
    if (Date.now() < retry) {
      return current.schedule ? current : { ...current, status: 'unavailable', message: '暂未找到可核实的官方安排，将在稍后重试' };
    }
    const existing = this.inFlight.get(year);
    if (existing) return existing;
    const task = this.fetchAndCache(year).then(result => !result.schedule && current.schedule ? current : result).finally(() => this.inFlight.delete(year));
    this.inFlight.set(year, task);
    return task;
  }

  private async fetchAndCache(year: number): Promise<ScheduleResult> {
    this.retryAt.set(year, Date.now() + RETRY_AFTER_MS);
    this.log(`[calendar] Looking for State Council holiday notice for ${year}`);
    try {
      const libraryUrl = `https://sousuo.www.gov.cn/zcwjk/policyDocumentLibrary?q=${encodeURIComponent(`国务院办公厅关于${year}年部分节假日安排的通知`)}&t=zhengcelibrary`;
      const libraryHtml = await fetchText(libraryUrl);
      const officialLinks = extractLinks(libraryHtml, libraryUrl, year);
      for (const link of officialLinks) {
        try {
          const html = await fetchText(link);
          const text = htmlToText(html);
          const publishedAt = publicationDateFromText(text);
          if (!publishedAt || !text.includes(`${year}年`) || !/国务院办公厅/.test(text)) continue;
          const parsed = parseHolidayNotice(text, year, link, publishedAt);
          if (parsed.schedule) {
            return this.persist(parsed.schedule, 'official-parser');
          }
          this.log(`[calendar] Official notice parser rejected ${link}: ${parsed.errors.join('; ')}`);
        } catch (error) {
          this.log(`[calendar] Official notice fetch failed (${link}): ${String(error)}`);
        }
      }
      if (officialLinks.length === 0) this.log(`[calendar] Official policy library returned no usable ${year} notice link`);
    } catch (error) {
      this.log(`[calendar] Official policy library search failed for ${year}: ${String(error)}`);
    }

    const prompt = buildAiSearchPrompt(year);
    const searchTargets = [
      { name: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(prompt)}&aep=22&newwindow=1` },
      { name: 'Baidu', url: `https://www.baidu.com/s?wd=${encodeURIComponent(prompt)}` }
    ];
    for (const target of searchTargets) {
      try {
        const html = await fetchText(target.url);
        const schedule = extractScheduleJson(html, year);
        if (schedule) {
          this.log(`[calendar] ${target.name} AI search returned a valid ${year} JSON schedule`);
          return this.persist(schedule, 'ai-search');
        }
        this.log(`[calendar] ${target.name} search page did not expose a complete official JSON schedule`);
      } catch (error) {
        this.log(`[calendar] ${target.name} search fallback failed for ${year}: ${String(error)}`);
      }
    }
    this.log(`[calendar] No verified holiday schedule found for ${year}; existing calendar data remains unchanged`);
    return { year, status: 'unavailable', schedule: null, message: '未找到可核实的官方安排；日历不会猜测休假或补班日期' };
  }

  private persist(value: HolidaySchedule, provenance: 'official-parser' | 'ai-search'): ScheduleResult {
    const year = Number(value.year);
    const schedule: Record<string, unknown> = {
      ...value,
      fetchedAt: new Date().toISOString(),
      parserVersion: 1,
      provenance
    };
    const validation = validateHolidaySchedule(schedule, year);
    if (!validation.valid || !isOfficialScheduleSource(String(schedule.source ?? ''))) {
      this.log(`[calendar] Rejected candidate schedule for ${year}: ${validation.errors.join('; ')}`);
      return { year, status: 'unavailable', schedule: null, message: '候选数据未通过完整性或来源校验' };
    }
    const path = this.cachePath(year);
    const temporary = `${path}.tmp`;
    mkdirSync(this.cacheDirectory, { recursive: true });
    writeFileSync(temporary, JSON.stringify(schedule, null, 2), 'utf8');
    renameSync(temporary, path);
    this.retryAt.delete(year);
    this.log(`[calendar] Saved verified ${year} holiday schedule: ${validation.restDayCount} rest days, ${validation.makeUpWorkDayCount} make-up workdays`);
    return { year, status: 'cache', schedule };
  }
}
