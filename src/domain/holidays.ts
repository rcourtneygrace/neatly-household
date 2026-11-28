/**
 * Holidays that can repeat every year as days off (Settings → Days off).
 * Common US holidays; each one is a single household day.
 */
import { addDays, makeDay, type Day } from './dates';
import type { VacationSpan } from './schedule';

export interface Holiday {
  id: string;
  name: string;
  on: (year: number) => Day;
}

/** The nth weekday (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Day {
  if (n > 0) {
    const first = new Date(year, month, 1).getDay();
    return makeDay(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDate = new Date(year, month + 1, 0);
  return makeDay(year, month, lastDate.getDate() - ((lastDate.getDay() - weekday + 7) % 7));
}

/** Easter Sunday (Gregorian calendar). */
function easter(year: number): Day {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDay(year, month - 1, day);
}

export const HOLIDAYS: Holiday[] = [
  { id: 'newYearsDay', name: "New Year's Day", on: (y) => makeDay(y, 0, 1) },
  { id: 'mlkDay', name: 'Martin Luther King Jr. Day', on: (y) => nthWeekday(y, 0, 1, 3) },
  { id: 'presidentsDay', name: "Presidents' Day", on: (y) => nthWeekday(y, 1, 1, 3) },
  { id: 'easter', name: 'Easter', on: easter },
  { id: 'mothersDay', name: "Mother's Day", on: (y) => nthWeekday(y, 4, 0, 2) },
  { id: 'memorialDay', name: 'Memorial Day', on: (y) => nthWeekday(y, 4, 1, -1) },
  { id: 'fathersDay', name: "Father's Day", on: (y) => nthWeekday(y, 5, 0, 3) },
  { id: 'juneteenth', name: 'Juneteenth', on: (y) => makeDay(y, 5, 19) },
  { id: 'independenceDay', name: 'Independence Day', on: (y) => makeDay(y, 6, 4) },
  { id: 'laborDay', name: 'Labor Day', on: (y) => nthWeekday(y, 8, 1, 1) },
  { id: 'halloween', name: 'Halloween', on: (y) => makeDay(y, 9, 31) },
  { id: 'thanksgiving', name: 'Thanksgiving', on: (y) => nthWeekday(y, 10, 4, 4) },
  { id: 'dayAfterThanksgiving', name: 'Day after Thanksgiving', on: (y) => addDays(nthWeekday(y, 10, 4, 4), 1) },
  { id: 'christmasEve', name: 'Christmas Eve', on: (y) => makeDay(y, 11, 24) },
  { id: 'christmas', name: 'Christmas Day', on: (y) => makeDay(y, 11, 25) },
  { id: 'newYearsEve', name: "New Year's Eve", on: (y) => makeDay(y, 11, 31) },
];

/** On until the household chooses its own: the three most households take off. */
export const DEFAULT_HOLIDAYS = ['newYearsDay', 'thanksgiving', 'christmas'];

export function holidaysOf(household: { holidays?: string[] }): string[] {
  return household.holidays ?? DEFAULT_HOLIDAYS;
}

/** The next date (from `from` on) of a holiday. */
export function nextDate(h: Holiday, from: Day): Day {
  const y = Number(from.slice(0, 4));
  const d = h.on(y);
  return d >= from ? d : h.on(y + 1);
}

/**
 * Every span where nothing counts: vacations, one-off days off, and the chosen holidays in the
 * years around `today`, except holidays someone chose to work ("Back to work").
 */
export function offDaySpans(input: {
  today: Day;
  vacations: { startDate: Day; endDate: Day | null; kind?: 'vacation' | 'dayOff'; label?: string | null }[];
  holidays: string[];
  workdays: Set<Day>;
}): VacationSpan[] {
  const spans: VacationSpan[] = input.vacations.map((v) => ({
    startDate: v.startDate,
    endDate: v.endDate,
    kind: v.kind ?? 'vacation',
    label: v.label ?? null,
  }));
  const y = Number(input.today.slice(0, 4));
  for (const h of HOLIDAYS) {
    if (!input.holidays.includes(h.id)) continue;
    for (const year of [y - 1, y, y + 1]) {
      const d = h.on(year);
      if (!input.workdays.has(d)) spans.push({ startDate: d, endDate: d, kind: 'dayOff', label: h.name });
    }
  }
  return spans;
}

/** The chosen holiday that falls on `day`, if any. */
export function holidayOn(day: Day, ids: string[]): Holiday | undefined {
  const y = Number(day.slice(0, 4));
  return HOLIDAYS.find((h) => ids.includes(h.id) && h.on(y) === day);
}
