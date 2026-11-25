import type { Cadence, SeasonName, SeasonPreset, Task, TimingMode, TimingValue } from '../data/types';

/** Pure task logic for the Plan tab: labels, previews, timing defaults and seasons. */

export const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'seasonal', 'yearly'];

export const CADENCE_LABEL: Record<Cadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  seasonal: 'Seasonal',
  yearly: 'Yearly',
};

export const SEASONS: SeasonName[] = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_LABEL: Record<SeasonName, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Monthly "specific day" values: 1..28, or -1 for the last day of the month. */
export const LAST_DAY = -1;
export const MONTH_DAY_OPTIONS = [1, ...Array.from({ length: 27 }, (_, i) => i + 2), LAST_DAY];

export interface Timing {
  cadence: Cadence;
  timingMode: TimingMode;
  timingValue: TimingValue;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

export function monthDayLabel(v: number): string {
  if (v === 1) return 'First day';
  if (v === LAST_DAY) return 'Last day';
  return ordinal(v);
}

/** The two Timing buttons for a cadence (none for Daily). */
export function timingChoices(cadence: Cadence): { specific: string; every: string } | null {
  switch (cadence) {
    case 'daily':
      return null;
    case 'weekly':
      return { specific: 'Specific day', every: 'Every week' };
    case 'monthly':
      return { specific: 'Specific day', every: 'Every month' };
    case 'seasonal':
      return { specific: 'Specific season', every: 'Every season' };
    case 'yearly':
      return { specific: 'Specific month', every: 'Any time in the year' };
  }
}

/** The calm card shown when the timing is "every" (Figma: "Once a month · Do it any time…"). */
export function everyInfo(cadence: Cadence): { title: string; body: string } | null {
  switch (cadence) {
    case 'weekly':
      return { title: 'Once a week', body: 'Do it any day. It resets every week.' };
    case 'monthly':
      return { title: 'Once a month', body: 'Do it any time during the month. It resets every month.' };
    case 'seasonal':
      return { title: 'Once a season', body: 'Do it any time in the season. It resets every season.' };
    case 'yearly':
      return { title: 'Once a year', body: 'Do it at any point in the year. It resets every year.' };
    default:
      return null;
  }
}

export function seasonOn(date: Date, starts: Record<SeasonName, string>): SeasonName {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  // The season whose start is the latest one on or before today; before all starts it is the last (winter) one.
  const ordered = [...SEASONS].sort((a, b) => starts[a].localeCompare(starts[b]));
  let current = ordered[ordered.length - 1];
  for (const s of ordered) if (starts[s] <= md) current = s;
  return current;
}

/** Sensible starting values when the cadence or timing mode changes. */
export function defaultTiming(
  cadence: Cadence,
  mode: TimingMode,
  today: Date,
  seasonStarts: Record<SeasonName, string>,
): Timing {
  if (cadence === 'daily') return { cadence, timingMode: 'every', timingValue: null };
  if (mode === 'every') return { cadence, timingMode: 'every', timingValue: null };
  switch (cadence) {
    case 'weekly':
      return { cadence, timingMode: 'specific', timingValue: [today.getDay()] };
    case 'monthly':
      return { cadence, timingMode: 'specific', timingValue: 1 };
    case 'seasonal':
      return { cadence, timingMode: 'specific', timingValue: [seasonOn(today, seasonStarts)] };
    case 'yearly':
      return { cadence, timingMode: 'specific', timingValue: today.getMonth() };
  }
}

/** Short schedule text used on Plan rows (Figma: "Every day", "Wednesdays", "Once every month", "Every Fall"). */
export function scheduleLabel(t: Timing): string {
  const v = t.timingValue;
  if (t.cadence === 'daily') return 'Every day';
  if (t.timingMode === 'every' || v === null) {
    return { weekly: 'Once every week', monthly: 'Once every month', seasonal: 'Once every season', yearly: 'Once every year' }[
      t.cadence
    ];
  }
  switch (t.cadence) {
    case 'weekly':
      return listText((v as number[]).map((d) => `${WEEKDAYS[d]}s`));
    case 'monthly':
      return v === LAST_DAY ? 'Last day of the month' : `${ordinal(v as number)} of the month`;
    case 'seasonal':
      return `Every ${listText((v as SeasonName[]).map((s) => SEASON_LABEL[s]))}`;
    case 'yearly':
      return `Every ${MONTHS[v as number]}`;
  }
}

/** The "How this will show up" sentence (wording from the Figma Edit task screens). */
export function previewText(t: Timing): string {
  const v = t.timingValue;
  if (t.cadence === 'daily') return 'Appears every day. Unfinished tasks roll over as Priority.';
  if (t.timingMode === 'every' || v === null) {
    switch (t.cadence) {
      case 'weekly':
        return 'Appears once every week, with no set day. It resets each week, and becomes Priority if left undone.';
      case 'monthly':
        return 'Appears once every month, with no set day. It resets each month, and becomes Priority if left undone.';
      case 'seasonal':
        return 'Appears once in every season (four times a year). It resets each season, and becomes Priority if left undone.';
      case 'yearly':
        return 'Appears once a year, with no set month. It resets each year, and becomes Priority if left undone.';
    }
  }
  switch (t.cadence) {
    case 'weekly': {
      const days = listText((v as number[]).map((d) => WEEKDAYS[d]));
      return `Shows up on ${days} with a Heads up tag, since it is meant for that day. If missed, it moves to Priority until done.`;
    }
    case 'monthly':
      return `On the ${v === LAST_DAY ? 'last day' : v === 1 ? 'first day' : ordinal(v as number)} of every month, with a few days of runway.`;
    case 'seasonal':
      return `Appears once, in ${listText((v as SeasonName[]).map((s) => SEASON_LABEL[s]))}, every year. If missed, it moves to Priority.`;
    case 'yearly':
      return `Appears once a year, in ${MONTHS[v as number]}. If missed, it moves to Priority.`;
  }
}

/** Monthly specific days show a runway timeline under the preview. */
export const MONTHLY_RUNWAY = [
  { when: '4 days before', what: 'Shows up quietly, with its date' },
  { when: '2 days before', tag: 'Heads up' },
  { when: 'On the day', tag: 'Today' },
  { when: 'Day after', tag: 'Priority' },
] as const;

export function timingIsComplete(t: Timing): boolean {
  if (t.cadence === 'daily' || t.timingMode === 'every') return true;
  const v = t.timingValue;
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === 'number';
}

export function cleanTiming(t: Timing): Timing {
  if (t.cadence === 'daily' || t.timingMode === 'every') return { cadence: t.cadence, timingMode: 'every', timingValue: null };
  return t;
}

function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---------- Plan list ---------- */

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => CADENCES.indexOf(a.cadence) - CADENCES.indexOf(b.cadence) || a.name.localeCompare(b.name),
  );
}

export function taskCountLabel(n: number): string {
  return n === 1 ? '1 task' : `${n} tasks`;
}

export function stepCountLabel(n: number): string {
  return n === 1 ? '1 step' : `${n} steps`;
}

/* ---------- Seasons ---------- */

export const SEASON_PRESETS: Record<Exclude<SeasonPreset, 'custom'>, Record<SeasonName, string>> = {
  calendar: { spring: '03-20', summer: '06-21', fall: '09-22', winter: '12-21' },
  weather: { spring: '03-01', summer: '06-01', fall: '09-01', winter: '12-01' },
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(monthIndex: number): number {
  return DAYS_IN_MONTH[monthIndex];
}

/** Day of a 365-day year, 0-based, from "MM-DD". Feb 29 is treated as Feb 28. */
function dayOfYear(md: string): number {
  const [m, d] = md.split('-').map(Number);
  return DAYS_IN_MONTH.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.min(d, DAYS_IN_MONTH[m - 1]) - 1;
}

function fromDayOfYear(n: number): string {
  let day = ((n % 365) + 365) % 365;
  let m = 0;
  while (day >= DAYS_IN_MONTH[m]) day -= DAYS_IN_MONTH[m++];
  return `${String(m + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
}

export function formatMonthDay(md: string): string {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/** Each season's start and its last day (the day before the next season starts). */
export function seasonRanges(starts: Record<SeasonName, string>) {
  return SEASONS.map((s, i) => {
    const next = SEASONS[(i + 1) % 4];
    const length = (((dayOfYear(starts[next]) - dayOfYear(starts[s])) % 365) + 365) % 365;
    return { season: s, start: starts[s], end: fromDayOfYear(dayOfYear(starts[next]) - 1), days: length };
  });
}

/** Seasons must follow each other through the year in order, each at least one day long. */
export function seasonsInOrder(starts: Record<SeasonName, string>): boolean {
  const ranges = seasonRanges(starts);
  return ranges.every((r) => r.days > 0) && ranges.reduce((sum, r) => sum + r.days, 0) === 365;
}

export function presetFor(starts: Record<SeasonName, string>): SeasonPreset {
  for (const [name, p] of Object.entries(SEASON_PRESETS)) {
    if (SEASONS.every((s) => p[s] === starts[s])) return name as SeasonPreset;
  }
  return 'custom';
}

export function seasonsSummary(starts: Record<SeasonName, string>): string {
  return SEASONS.map((s) => formatMonthDay(starts[s])).join(' · ');
}
