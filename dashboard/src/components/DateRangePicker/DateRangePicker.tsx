import { useState, useMemo, useCallback } from 'react';
import styles from './DateRangePicker.module.css';

interface DateRangePickerProps {
  onApply: (from: string, to: string) => void;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function DateRangePicker({ onApply }: DateRangePickerProps) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const result: (Date | null)[][] = [];
    let week: (Date | null)[] = [];

    for (let i = 0; i < startOffset; i++) week.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      result.push(week);
    }
    return result;
  }, [year, month]);

  const prevMonth = useCallback(() => {
    setViewDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const nextMonth = useCallback(() => {
    setViewDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const handleDayClick = useCallback((d: Date) => {
    if (!startDate || endDate) {
      // First click or resetting: set start
      setStartDate(d);
      setEndDate(null);
    } else {
      // Second click: set end (swap if needed)
      if (d.getTime() < startDate.getTime()) {
        setEndDate(startDate);
        setStartDate(d);
      } else {
        setEndDate(d);
      }
    }
  }, [startDate, endDate]);

  const handleApply = useCallback(() => {
    if (startDate && endDate) {
      onApply(toDateStr(startDate), toDateStr(endDate));
    }
  }, [startDate, endDate, onApply]);

  // Determine highlight range for hover preview
  const previewEnd = endDate ?? hoveredDate;
  const rangeStart = startDate && previewEnd
    ? (previewEnd.getTime() < startDate.getTime() ? previewEnd : startDate)
    : null;
  const rangeEnd = startDate && previewEnd
    ? (previewEnd.getTime() < startDate.getTime() ? startDate : previewEnd)
    : null;

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const selectionLabel = startDate
    ? endDate
      ? `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – pick end`
    : 'Tap a start date';

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Previous month">‹</button>
        <span className={styles.monthLabel}>{monthLabel}</span>
        <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Next month">›</button>
      </div>

      <div className={styles.dayNames}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d} className={styles.dayName}>{d}</span>
        ))}
      </div>

      <div className={styles.grid}>
        {weeks.map((week, wi) => (
          <div key={wi} className={styles.week}>
            {week.map((day, di) => {
              if (!day) return <span key={di} className={styles.empty} />;

              const isToday = sameDay(day, today);
              const isStart = startDate ? sameDay(day, startDate) : false;
              const isEnd = endDate ? sameDay(day, endDate) : false;
              const inRange = rangeStart && rangeEnd && !isStart && !isEnd
                ? isBetween(day, rangeStart, rangeEnd) : false;
              const isFuture = day.getTime() > today.getTime();

              const cls = [
                styles.day,
                isStart ? styles.start : '',
                isEnd ? styles.end : '',
                inRange ? styles.inRange : '',
                isToday ? styles.today : '',
                isFuture ? styles.disabled : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={di}
                  type="button"
                  className={cls}
                  disabled={isFuture}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => { if (startDate && !endDate) setHoveredDate(day); }}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.selection}>{selectionLabel}</span>
        <button
          type="button"
          className={styles.applyBtn}
          disabled={!startDate || !endDate}
          onClick={handleApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
