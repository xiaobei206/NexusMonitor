import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { buildCalendarMonth, calendarDateKey, getCalendarDayInfo, getCalendarScheduleCoverage } from './calendar-data.mjs';
import type { CalendarDayInfo } from './calendar-data.mjs';
import './widget-calendar.css';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const monthTitle = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;

function formatFullDate(date: Date) {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function CalendarDayButton({ day, selected, today, onSelect }: {
  day: CalendarDayInfo; selected: boolean; today: boolean; onSelect: (date: Date) => void;
}) {
  const classes = [
    'calendar-day',
    day.inMonth ? 'in-month' : 'adjacent-month',
    day.isBlueDate ? 'blue-date' : 'normal-date',
    selected ? 'selected' : '',
    today ? 'today' : '',
    day.labelKind === 'festival' ? 'festival-day' : '',
  ].filter(Boolean).join(' ');
  return <button type="button" className={classes} onClick={() => onSelect(day.date)} aria-label={`${formatFullDate(day.date)}，${day.lunar.fullLabel}，${day.statusLabel}${day.subLabel ? `，${day.subLabel}` : ''}`}>
    <span className="calendar-day-number">{day.dayNumber}</span>
    {day.badge && <span className={`calendar-day-badge ${day.badge === '休' ? 'rest-badge' : 'work-badge'}`}>{day.badge}</span>}
    <span className="calendar-day-subtitle">{day.subLabel}</span>
  </button>;
}

export default function WidgetCalendarWindow() {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  const todayKey = calendarDateKey(now);
  const selectedKey = calendarDateKey(selectedDate);
  const days = useMemo(() => buildCalendarMonth(viewMonth.getFullYear(), viewMonth.getMonth()), [viewMonth]);
  const selectedInfo = getCalendarDayInfo(selectedDate);
  const scheduleCoverage = getCalendarScheduleCoverage(viewMonth.getFullYear());

  const changeMonth = (delta: number) => {
    setViewMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  };
  const goToday = () => {
    const current = new Date();
    const today = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 12);
    setViewMonth(new Date(current.getFullYear(), current.getMonth(), 1, 12));
    setSelectedDate(today);
  };
  const selectDate = (date: Date) => {
    setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12));
    if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
      setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    }
  };
  const close = () => void window.nexus.closeWidgetCalendar();

  return <main className="calendar-window-shell">
    <header className="calendar-window-header">
      <div className="calendar-window-brand"><span className="calendar-brand-mark">N</span><span><b>NEXUS MONITOR</b><small>中国日历 · 农历与节假日</small></span></div>
      <button type="button" className="calendar-window-close" onClick={close} aria-label="关闭日历" title="关闭日历"><X size={18}/></button>
    </header>

    <section className="calendar-month-section">
      <div className="calendar-month-toolbar">
        <div className="calendar-month-heading"><CalendarDays size={20}/><h1>{monthTitle(viewMonth)}</h1></div>
        <div className="calendar-month-actions">
          <button type="button" onClick={() => changeMonth(-1)} title="上个月" aria-label="上个月"><ChevronLeft size={18}/></button>
          <button type="button" className="calendar-today-button" onClick={goToday}>今天</button>
          <button type="button" onClick={() => changeMonth(1)} title="下个月" aria-label="下个月"><ChevronRight size={18}/></button>
        </div>
      </div>
      <div className="calendar-weekdays" role="row">
        {weekdays.map((weekday, index) => <span key={weekday} className={index > 4 ? 'weekend-heading' : ''}>{weekday}</span>)}
      </div>
      <div className="calendar-month-grid" role="grid" aria-label={monthTitle(viewMonth)}>
        {days.map(day => <CalendarDayButton
          key={day.key}
          day={day}
          selected={day.key === selectedKey}
          today={day.key === todayKey}
          onSelect={selectDate}
        />)}
      </div>
    </section>

    <section className="calendar-selected-panel" aria-live="polite">
      <div className="calendar-selected-date">
        <div><b>{formatFullDate(selectedDate)}</b><span>农历 {selectedInfo.lunar.fullLabel}</span></div>
        <span className={`calendar-status-pill ${selectedInfo.status === 'rest' ? 'status-rest' : selectedInfo.status === 'work' ? 'status-work' : selectedInfo.status === 'weekend' ? 'status-weekend' : selectedInfo.status === 'unknown' ? 'status-unknown' : 'status-normal'}`}>
          {selectedInfo.status === 'rest' ? '休息日' : selectedInfo.status === 'work' ? '调休上班' : selectedInfo.status === 'weekend' ? '周末' : selectedInfo.status === 'unknown' ? '调休安排待公布' : '工作日'}
        </span>
      </div>
      <div className="calendar-selected-event">
        {selectedInfo.festival ?? selectedInfo.solarTerm ?? selectedInfo.lunar.fullLabel}
        {selectedInfo.badge === '休' && <small> · 国务院节假日安排</small>}
        {selectedInfo.badge === '班' && <small> · 国务院调休安排</small>}
      </div>
    </section>

    <footer className="calendar-window-footer">
      <div className="calendar-legend">
        <span><i className="legend-badge legend-rest">休</i>放假</span>
        <span><i className="legend-badge legend-work">班</i>调休上班</span>
        <span><i className="legend-weekend-dot"/>周末</span>
      </div>
      <p>{scheduleCoverage}。节假日安排以国务院年度通知为准。</p>
    </footer>
  </main>;
}
