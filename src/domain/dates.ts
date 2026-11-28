/** Local calendar dates as "YYYY-MM-DD" strings. No time zones: everything is the phone's local day. */

export type Day = string;

export function toDay(d: Date): Day {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: Day, n: number): Day {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((fromDay(b).getTime() - fromDay(a).getTime()) / 86_400_000);
}

export function weekdayOf(day: Day): number {
  return fromDay(day).getDay();
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function makeDay(year: number, monthIndex: number, date: number): Day {
  return toDay(new Date(year, monthIndex, date));
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 17" */
export function shortDate(day: Day): string {
  const d = fromDay(day);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function monthShort(day: Day): string {
  return MONTHS_SHORT[fromDay(day).getMonth()];
}

/** "Thursday, October 15" */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "11:42 am" */
export function clockTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** "07:00" → "7:00 am" */
export function hhmmLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return clockTime(new Date(2000, 0, 1, h, m));
}

/** Minutes since midnight for a Date or an "HH:MM" string. */
export function minutesOf(t: Date | string): number {
  if (typeof t === 'string') {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  return t.getHours() * 60 + t.getMinutes();
}

/** "Fri, Dec 25" */
export function weekdayDate(day: Day): string {
  return fromDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
