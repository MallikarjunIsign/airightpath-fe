import { useEffect, useRef, useState } from 'react';
import {
  parseISO,
  format,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
  addMonths,
  subMonths,
} from 'date-fns';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateTimeFieldProps {
  label?: string;
  /** Combined value in `YYYY-MM-DDTHH:mm` form (or '' when unset). */
  value: string;
  onChange: (value: string) => void;
  /**
   * Earliest selectable moment, as `YYYY-MM-DDTHH:mm`. Earlier days are
   * disabled on the calendar and, on the minimum day itself, earlier times are
   * disabled on the clock — so `min` of "today 14:30" cannot yield 09:00 today.
   */
  min?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Custom, fully in-page date + time picker: a calendar tab for the date and an
 * analog-clock tab for the time. Everything is DOM we render and size ourselves
 * (no native `datetime-local` / `<select>` popups, which overflow narrow
 * viewports). Emits the same `YYYY-MM-DDTHH:mm` value the native control did.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  min,
  helperText,
  required,
  disabled,
}: Readonly<DateTimeFieldProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'date' | 'time'>('date');

  const parsed = value ? parseISO(value) : null;
  const selected = parsed && isValid(parsed) ? parsed : null;
  const minParsed = min ? parseISO(min) : null;
  const minMoment = minParsed && isValid(minParsed) ? minParsed : null;
  const minDay = minMoment ? startOfDay(minMoment) : null;

  /** On the minimum day the clock is bounded too; other days are unbounded. */
  const minTime =
    minMoment && selected && isSameDay(selected, minMoment)
      ? { hour: minMoment.getHours(), minute: minMoment.getMinutes() }
      : null;

  const [viewMonth, setViewMonth] = useState<Date>(selected ?? new Date());

  // Keep the visible month in sync when a value is set from outside.
  useEffect(() => {
    if (selected) setViewMonth((m) => (isSameMonth(m, selected) ? m : selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Reset to the date tab each time the popover opens.
  useEffect(() => {
    if (open) setTab('date');
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hour = selected ? selected.getHours() : 0;
  const minute = selected ? selected.getMinutes() : 0;

  /** Writes the value, never below `min` — a safety net behind the disabled UI. */
  const commit = (base: Date, h: number, m: number) => {
    let next = setMinutes(setHours(base, h), m);
    if (minMoment && isBefore(next, minMoment)) next = minMoment;
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"));
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  const displayText = selected ? format(selected, 'dd MMM yyyy, HH:mm') : '';

  const fieldClasses =
    'w-full px-4 py-2.5 h-11 rounded-xl bg-[var(--inputBg)] border border-[var(--inputBorder)] ' +
    'text-[var(--text)] focus:outline-none focus:border-[var(--inputFocus)] focus:ring-2 ' +
    'focus:ring-[var(--inputFocus)]/15 disabled:opacity-50 disabled:cursor-not-allowed ' +
    'transition-all duration-200 flex items-center justify-between gap-2';

  const tabClasses = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
      active
        ? 'bg-[var(--primary)] text-white'
        : 'text-[var(--textSecondary)] hover:bg-[var(--surface1)]'
    }`;

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-[var(--text)] mb-2">
          {label}
          {required && <span className="text-[var(--error)] ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={fieldClasses}
      >
        <span className={selected ? 'text-[var(--text)]' : 'text-[var(--textTertiary)]'}>
          {displayText || 'Select date & time'}
        </span>
        <Calendar size={16} className="text-[var(--textTertiary)] flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[18rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-[var(--cardBg)] shadow-xl p-3">
          {/* Tabs */}
          <div className="flex gap-1 mb-3 p-1 rounded-xl bg-[var(--surface1)]">
            <button type="button" className={tabClasses(tab === 'date')} onClick={() => setTab('date')}>
              <Calendar size={15} />
              Date
            </button>
            <button type="button" className={tabClasses(tab === 'time')} onClick={() => setTab('time')}>
              <Clock size={15} />
              Time
            </button>
          </div>

          {tab === 'date' ? (
            <>
              {/* Month header */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setViewMonth((m) => subMonths(m, 1))}
                  className="p-1 rounded-md hover:bg-[var(--surface1)] text-[var(--text)]"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-[var(--text)]">
                  {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                  type="button"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="p-1 rounded-md hover:bg-[var(--surface1)] text-[var(--text)]"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Weekdays */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w) => (
                  <span
                    key={w}
                    className="text-center text-xs font-medium text-[var(--textTertiary)] py-1"
                  >
                    {w}
                  </span>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((day) => {
                  const isDisabled = minDay ? isBefore(day, minDay) : false;
                  const isSel = selected ? isSameDay(day, selected) : false;
                  const inMonth = isSameMonth(day, viewMonth);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        commit(day, hour, minute);
                        setTab('time');
                      }}
                      className={`h-8 rounded-md text-sm transition-colors ${
                        isSel
                          ? 'bg-[var(--primary)] text-white font-semibold'
                          : isDisabled
                            ? 'text-[var(--textTertiary)] opacity-40 cursor-not-allowed'
                            : inMonth
                              ? 'text-[var(--text)] hover:bg-[var(--surface1)]'
                              : 'text-[var(--textTertiary)] hover:bg-[var(--surface1)]'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <ClockPicker
              hour={hour}
              minute={minute}
              minTime={minTime}
              onChange={(h, m) => commit(selected ?? new Date(), h, m)}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
            <span className="text-sm text-[var(--textSecondary)]">
              {selected ? format(selected, 'dd MMM yyyy · HH:mm') : 'No date selected'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {helperText && <p className="mt-1.5 text-sm text-[var(--textSecondary)]">{helperText}</p>}
    </div>
  );
}

interface ClockPickerProps {
  hour: number; // 0-23
  minute: number; // 0-59
  /** Earliest allowed time on the selected day, or null when unbounded. */
  minTime?: { hour: number; minute: number } | null;
  onChange: (hour: number, minute: number) => void;
}

const CLOCK_SIZE = 220;
const CLOCK_C = CLOCK_SIZE / 2;
const CLOCK_R = 84;

/** Position on the clock face for a value at `angleDeg` (0° = 12 o'clock, clockwise). */
function clockPoint(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CLOCK_C + radius * Math.sin(rad), y: CLOCK_C - radius * Math.cos(rad) };
}

/**
 * Analog clock time picker (12-hour face + AM/PM). Tap the hour ring, then the
 * minute ring — like the standard Android/Material time picker. Converts to/from
 * the 24-hour value the parent stores.
 */
function ClockPicker({ hour, minute, minTime, onChange }: Readonly<ClockPickerProps>) {
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');

  const period: 'AM' | 'PM' = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const to24 = (h12: number, p: 'AM' | 'PM') => (h12 % 12) + (p === 'PM' ? 12 : 0);

  // A whole hour is out of reach only when even its last minute is too early.
  const isHourDisabled = (h24: number) => !!minTime && h24 < minTime.hour;
  const isMinuteDisabled = (m: number) =>
    !!minTime && (hour < minTime.hour || (hour === minTime.hour && m < minTime.minute));
  // AM is unreachable whenever the same hour in the morning is below the floor.
  const isPeriodDisabled = (p: 'AM' | 'PM') =>
    !!minTime && p === 'AM' && to24(hour12, 'AM') < minTime.hour;

  const setPeriod = (p: 'AM' | 'PM') => {
    if (isPeriodDisabled(p)) return;
    const next24 = to24(hour12, p);
    if (isHourDisabled(next24)) return;
    onChange(next24, minute);
  };

  const pickHour12 = (h12: number) => {
    const next24 = to24(h12, period);
    if (isHourDisabled(next24)) return;
    // Jumping onto the minimum hour can strand the minutes in the past.
    const nextMinute =
      minTime && next24 === minTime.hour && minute < minTime.minute ? minTime.minute : minute;
    onChange(next24, nextMinute);
    setMode('minutes');
  };

  const handleFaceClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CLOCK_SIZE - CLOCK_C;
    const y = ((e.clientY - rect.top) / rect.height) * CLOCK_SIZE - CLOCK_C;
    let angle = (Math.atan2(x, -y) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    if (mode === 'hours') {
      const h = Math.round(angle / 30) % 12; // 0-11, where 0 means 12 o'clock
      pickHour12(h === 0 ? 12 : h);
    } else {
      const m = Math.round(angle / 6) % 60;
      if (isMinuteDisabled(m)) return;
      onChange(hour, m);
    }
  };

  const handAngle = mode === 'hours' ? (hour12 % 12) * 30 : minute * 6;
  const hand = clockPoint(handAngle, CLOCK_R);

  const numbers =
    mode === 'hours'
      ? Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
      : Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

  const isActiveNumber = (n: number) => (mode === 'hours' ? n === hour12 : n === minute);

  return (
    <div className="flex flex-col items-center">
      {/* Digital readout + AM/PM */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode('hours')}
          className={`text-3xl font-semibold tabular-nums px-1 rounded ${
            mode === 'hours' ? 'text-[var(--primary)]' : 'text-[var(--text)]'
          }`}
        >
          {pad(hour12)}
        </button>
        <span className="text-3xl font-semibold text-[var(--text)]">:</span>
        <button
          type="button"
          onClick={() => setMode('minutes')}
          className={`text-3xl font-semibold tabular-nums px-1 rounded ${
            mode === 'minutes' ? 'text-[var(--primary)]' : 'text-[var(--text)]'
          }`}
        >
          {pad(minute)}
        </button>
        <div className="flex flex-col gap-1 ml-2">
          {(['AM', 'PM'] as const).map((p) => {
            const disabled = isPeriodDisabled(p);
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 text-xs font-semibold rounded border transition-colors ${
                  period === p
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'text-[var(--textSecondary)] border-[var(--border)] hover:bg-[var(--surface1)]'
                } ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clock face */}
      <svg
        viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        className="w-full max-w-[220px] touch-none cursor-pointer select-none"
        onClick={handleFaceClick}
      >
        <circle cx={CLOCK_C} cy={CLOCK_C} r={CLOCK_C - 4} className="fill-[var(--surface1)]" />
        {/* Selection hand */}
        <line
          x1={CLOCK_C}
          y1={CLOCK_C}
          x2={hand.x}
          y2={hand.y}
          className="stroke-[var(--primary)]"
          strokeWidth={2}
        />
        <circle cx={CLOCK_C} cy={CLOCK_C} r={3} className="fill-[var(--primary)]" />
        <circle cx={hand.x} cy={hand.y} r={16} className="fill-[var(--primary)]" />
        {/* Numbers */}
        {numbers.map((n) => {
          const angle = mode === 'hours' ? (n % 12) * 30 : n * 6;
          const p = clockPoint(angle, CLOCK_R);
          const active = isActiveNumber(n);
          const disabled =
            mode === 'hours' ? isHourDisabled(to24(n, period)) : isMinuteDisabled(n);
          let fill = 'fill-[var(--text)]';
          if (active) fill = 'fill-white';
          else if (disabled) fill = 'fill-[var(--textTertiary)] opacity-40';
          return (
            <text
              key={n}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`text-[13px] font-medium pointer-events-none ${fill}`}
            >
              {mode === 'hours' ? n : pad(n)}
            </text>
          );
        })}
      </svg>
      <p className="text-xs text-[var(--textTertiary)] mt-2">
        {minTime
          ? `Earliest today is ${pad(minTime.hour)}:${pad(minTime.minute)}`
          : `Tap the ${mode === 'hours' ? 'hour' : 'minute'} on the clock`}
      </p>
    </div>
  );
}
