const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseHolidayNotice, validateHolidaySchedule, extractScheduleJson
} = require('../dist-electron/shared/calendar-holiday-parser.js');

const source = 'https://www.gov.cn/zhengce/zhengceku/example.htm';

test('parser handles 2017 legacy wording, including a separate compensatory rest day', () => {
  const notice = `一、元旦：1月1日放假，1月2日（星期一）补休。二、春节：1月27日至2月2日放假调休，共7天。1月22日（星期日）、2月4日（星期六）上班。三、清明节：4月2日至4日放假调休，共3天。4月1日（星期六）上班。四、劳动节：5月1日放假，与周末连休。五、端午节：5月28日至30日放假调休，共3天。5月27日（星期六）上班。六、中秋节、国庆节：10月1日至8日放假调休，共8天。9月30日（星期六）上班。国务院办公厅 2016年12月1日`;
  const parsed = parseHolidayNotice(notice, 2017, source, '2016-12-01');
  assert.equal(parsed.schedule?.restDays.length, 24);
  assert.equal(parsed.schedule?.makeUpWorkDays.length, 5);
  assert.ok(parsed.schedule?.restDays.includes('2017-01-02'));
  assert.ok(parsed.schedule?.makeUpWorkDays.includes('2017-09-30'));
  assert.deepEqual(parsed.errors, []);
});

test('parser handles cross-year dates and “与周末连休” single-day notices', () => {
  const notice = `一、元旦：2018年12月30日至2019年1月1日放假调休，共3天。2018年12月29日（星期六）上班。二、春节：2月4日至10日放假调休，共7天。2月2日（星期六）、2月3日（星期日）上班。三、清明节：4月5日放假，与周末连休。四、劳动节：5月1日放假。五、端午节：6月7日放假，与周末连休。六、中秋节：9月13日放假，与周末连休。七、国庆节：10月1日至7日放假调休，共7天。9月29日（星期日）、10月12日（星期六）上班。国务院办公厅 2018年12月4日`;
  const parsed = parseHolidayNotice(notice, 2019, source, '2018-12-06');
  assert.ok(parsed.schedule, parsed.errors.join('; '));
  assert.ok(parsed.schedule.restDays.includes('2018-12-30'));
  assert.ok(parsed.schedule.restDays.includes('2019-01-01'));
  assert.deepEqual(parsed.schedule.makeUpWorkDays, ['2018-12-29','2019-02-02','2019-02-03','2019-09-29','2019-10-12']);
});

test('parser handles parenthesized weekday annotations before a range marker', () => {
  const notice = `一、元旦：1月1日（周四）至3日（周六）放假调休，共3天。1月4日（周日）上班。二、春节：2月15日（农历腊月二十八、周日）至23日（农历正月初七、周一）放假调休，共9天。2月14日（周六）、2月28日（周六）上班。三、清明节：4月4日（周六）至6日（周一）放假，共3天。四、劳动节：5月1日（周五）至5日（周二）放假调休，共5天。5月9日（周六）上班。五、端午节：6月19日（周五）至21日（周日）放假，共3天。六、中秋节：9月25日（周五）至27日（周日）放假，共3天。七、国庆节：10月1日（周四）至7日（周三）放假调休，共7天。9月20日（周日）、10月10日（周六）上班。国务院办公厅 2025年11月4日`;
  const parsed = parseHolidayNotice(notice, 2026, source, '2025-11-04');
  assert.ok(parsed.schedule, parsed.errors.join('; '));
  assert.equal(parsed.schedule.restDays.length, 33);
  assert.ok(parsed.schedule.makeUpWorkDays.includes('2026-01-04'));
  assert.ok(parsed.schedule.restDays.includes('2026-02-23'));
});

test('parser handles 2027 weekday/lunar annotations and all seven holiday clauses', () => {
  const notice = `一、元旦：1月1日（周五）至3日（周日）放假，共3天。二、春节：2月5日（农历除夕、周五）至13日（农历正月初八、周六）放假调休，共9天。1月31日（周日）、2月14日（周日）上班。三、清明节：4月3日（周六）至5日（周一）放假，共3天。四、劳动节：5月1日（周六）至5日（周三）放假调休，共5天。5月8日（周六）上班。五、端午节：6月9日（周三）放假，共1天。六、中秋节：9月15日（周三）放假，共1天。七、国庆节：10月1日（周五）至7日（周四）放假调休，共7天。9月26日（周日）、10月9日（周六）上班。国务院办公厅 2026年11月5日`;
  const parsed = parseHolidayNotice(notice, 2027, source, '2026-11-05');
  assert.ok(parsed.schedule, parsed.errors.join('; '));
  assert.equal(parsed.schedule.restDays.length, 29);
  assert.equal(parsed.schedule.makeUpWorkDays.length, 5);
  assert.ok(parsed.schedule.restDays.includes('2027-02-13'));
  assert.ok(parsed.schedule.makeUpWorkDays.includes('2027-10-09'));
});

test('validation rejects duplicates, impossible dates, and rest/work conflicts', () => {
  const result = validateHolidaySchedule({
    year: 2028, source, publishedAt: '2027-11-01',
    restDays: ['2028-01-01','2028-01-01','2028-02-30'],
    makeUpWorkDays: ['2028-01-01']
  }, 2028);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(value => value.includes('重复')));
  assert.ok(result.errors.some(value => value.includes('无效日期')));
  assert.ok(result.errors.some(value => value.includes('冲突')));
});

test('AI fallback accepts only complete JSON tied to a real official URL', () => {
  const good = JSON.stringify({
    year: 2028, source: 'https://www.gov.cn/zhengce/example.htm',
    publishedAt: '2027-11-01', restDays: ['2028-01-01'], makeUpWorkDays: []
  });
  assert.equal(extractScheduleJson(`AI result: ${good}`, 2028)?.year, 2028);
  const weak = JSON.stringify({
    year: 2028, source: 'www.gov.cn',
    publishedAt: '2027-11-01', restDays: ['2028-01-01'], makeUpWorkDays: []
  });
  assert.equal(extractScheduleJson(weak, 2028), null);
});
