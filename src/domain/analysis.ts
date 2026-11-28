import type { Cadence, DayLog, Department, Occurrence, Task } from '../data/types';
import { addDays, fromDay, toDay, weekdayOf, type Day } from './dates';
import { doneDay, inVacation, instancesAround, windowEnd, occKey, periodFor, type Instance, type PlanCalendar, type VacationSpan } from './schedule';
import { CADENCE_LABEL, WEEKDAYS } from './tasks';

/**
 * Analysis: pure functions over tasks, occurrences and day logs.
 *
 * Score = share of the period's finished windows that found their time. On time counts 1,
 * late (carried over, then done) counts ½, missed counts 0. Set-aside (deferred) instances are
 * left out entirely, and daily tasks only count on days the household was opened.
 * 85+ is Flowing, 65–84 Steady, under 65 Ready for a reset. Never a grade, never red.
 */

export type Range = 'month' | 'season' | 'year';
export const RANGE_LABEL: Record<Range, string> = { month: 'Month', season: 'Season', year: 'Year' };
const RANGE_CADENCE: Record<Range, Cadence> = { month: 'monthly', season: 'seasonal', year: 'yearly' };

export function rangeFor(range: Range, today: Day, cal: PlanCalendar): { from: Day; to: Day } {
  const p = periodFor(RANGE_CADENCE[range], today, cal);
  return { from: p.start, to: p.end };
}

export type Outcome = 'onTime' | 'late' | 'missed' | 'deferred' | 'open' | 'skip';

export interface AnalysisInput {
  today: Day;
  tasks: Task[];
  occurrences: Occurrence[];
  dayLogs: DayLog[];
  cal: PlanCalendar;
  /** Vacation days are left out of every number */
  vacations?: VacationSpan[];
}

export interface Judged {
  inst: Instance;
  outcome: Outcome;
  occ?: Occurrence;
}

/** All instances of a task that overlap [from, to]. */
export function instancesBetween(task: Task, from: Day, to: Day, cal: PlanCalendar): Instance[] {
  if (task.cadence === 'daily') {
    const out: Instance[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, start: d, end: d, due: null });
    return out;
  }
  const map = new Map<Day, Instance>();
  const probe = (d: Day) => {
    for (const i of instancesAround(task, d, cal)) if (i.end >= from && i.start <= to) map.set(i.key, i);
  };
  for (let d = from; d <= to; d = addDays(d, 7)) probe(d);
  probe(to);
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function since(task: Task): Day {
  return task.activeSince ?? toDay(new Date(task.createdAt));
}

export function judge(
  task: Task,
  inst: Instance,
  occ: Occurrence | undefined,
  today: Day,
  openedDays: Set<Day>,
  vacations?: VacationSpan[],
): Outcome {
  if (inst.end < since(task)) return 'skip';
  // Due on a day off: judged by the day it moved to
  const end = windowEnd(inst, vacations);
  if (occ?.status !== 'done' && inVacation(end, vacations, today)) return 'skip';
  if (occ?.status === 'deferred') return 'deferred';
  if (occ?.status === 'done') {
    const on = occ.completedAt ? doneDay(occ) : end;
    return on <= end ? 'onTime' : 'late';
  }
  if (occ?.status === 'carriedOver') return 'late';
  if (end >= today) return 'open';
  if (task.cadence === 'daily' && !openedDays.has(inst.key)) return 'skip';
  return 'missed';
}

export interface Tally {
  onTime: number;
  late: number;
  missed: number;
  deferred: number;
}
const emptyTally = (): Tally => ({ onTime: 0, late: 0, missed: 0, deferred: 0 });

export function scoreOf(t: Tally): number | null {
  const n = t.onTime + t.late + t.missed;
  if (n === 0) return null;
  return Math.round((100 * (t.onTime + t.late / 2)) / n);
}

export type Feeling = 'flowing' | 'steady' | 'reset';
export const FEELING_LABEL: Record<Feeling, string> = { flowing: 'Flowing', steady: 'Steady', reset: 'Ready for a reset' };

export function feelingOf(score: number | null): Feeling | null {
  if (score === null) return null;
  return score >= 85 ? 'flowing' : score >= 65 ? 'steady' : 'reset';
}

export interface TaskStats {
  task: Task;
  judged: Judged[];
  tally: Tally;
  deferReasons: string[];
}

export interface DepartmentStats {
  department: Department;
  tasks: TaskStats[];
  tally: Tally;
  score: number | null;
  feeling: Feeling | null;
}

function openedSet(logs: DayLog[]): Set<Day> {
  return new Set(logs.filter((l) => l.openingStatus === 'done').map((l) => l.date));
}

function occIndex(occurrences: Occurrence[]) {
  return new Map(occurrences.map((o) => [occKey(o.taskId, o.periodStart), o]));
}

export function taskStats(input: AnalysisInput, from: Day, to: Day): TaskStats[] {
  const occ = occIndex(input.occurrences);
  const opened = openedSet(input.dayLogs);
  return input.tasks
    .filter((t) => !t.deletedAt && !t.archived)
    .map((task) => {
      const judged = instancesBetween(task, from, to, input.cal).map((inst) => {
        const o = occ.get(occKey(task.id, inst.key));
        return { inst, occ: o, outcome: judge(task, inst, o, input.today, opened, input.vacations) };
      });
      const tally = emptyTally();
      const deferReasons: string[] = [];
      for (const j of judged) {
        if (j.outcome === 'onTime' || j.outcome === 'late' || j.outcome === 'missed' || j.outcome === 'deferred') tally[j.outcome]++;
        if (j.outcome === 'deferred' && j.occ?.deferReason) deferReasons.push(j.occ.deferReason);
      }
      return { task, judged, tally, deferReasons };
    });
}

function addTally(a: Tally, b: Tally): Tally {
  return { onTime: a.onTime + b.onTime, late: a.late + b.late, missed: a.missed + b.missed, deferred: a.deferred + b.deferred };
}

export function departmentStats(stats: TaskStats[], departments: Department[]): DepartmentStats[] {
  return departments
    .filter((d) => d.enabled && !d.deletedAt)
    .map((department) => {
      const tasks = stats.filter((s) => s.task.departmentId === department.id);
      const tally = tasks.reduce((t, s) => addTally(t, s.tally), emptyTally());
      const score = scoreOf(tally);
      return { department, tasks, tally, score, feeling: feelingOf(score) };
    });
}

/* ---------- Home health sentence ---------- */

export function homeHealth(depts: DepartmentStats[], range: Range): { title: string; body: string } {
  const word = range === 'season' ? 'season' : range;
  const tally = depts.reduce((t, d) => addTally(t, d.tally), emptyTally());
  const overall = feelingOf(scoreOf(tally));
  if (!overall) {
    return {
      title: 'Your rhythm will show here soon',
      body: 'Check off tasks on Today for a week or two and this page will show how your home is running. There is nothing to judge yet.',
    };
  }
  const reset = depts.filter((d) => d.feeling === 'reset').map((d) => d.department.name);
  const title =
    overall === 'flowing'
      ? 'Your home is in a good rhythm'
      : overall === 'steady'
        ? 'Your home is finding its rhythm'
        : 'Your home could use a little room';
  const lead =
    overall === 'reset'
      ? `A good part of what you planned this ${word} is still waiting, and that is okay.`
      : `Most of what you planned this ${word} found its time.`;
  const rest = depts.filter((d) => d.feeling && d.feeling !== 'reset');
  const restWord = rest.every((d) => d.feeling === 'flowing') ? 'flowing' : 'steady';
  const tail =
    reset.length === 0
      ? ` Everything is ${restWord}.`
      : ` ${reset.length > 2 ? `${reset.length} departments` : listText(reset)} could use a little room next${rest.length ? `, and everything else is ${restWord}` : ''}.`;
  return { title, body: lead + tail };
}

/* ---------- Suggestions ---------- */

export const LESS_OFTEN: Partial<Record<Cadence, Cadence>> = {
  daily: 'weekly',
  weekly: 'monthly',
  monthly: 'seasonal',
  seasonal: 'yearly',
};

export type SlipKind = 'setAside' | 'late' | 'behind';
export const SLIP_LABEL: Record<SlipKind, string> = {
  setAside: 'Often set aside',
  late: 'Often running late',
  behind: 'Slightly behind',
};

export interface Suggestion {
  task: Task;
  kind: 'setAside' | 'late';
  to: Cadence;
  /** How many in a row / out of the last four */
  count: number;
}

/**
 * Skip reasons that can suggest a change of rhythm. Life getting in the way ("I'm sick", "Bad
 * weather", "Something came up") never does, and neither does a skip with no reason.
 */
export function reasonSuggests(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason === 'Not needed this time' || reason === 'No time' || reason.startsWith('Other');
}

export function isWeather(reason: string | null | undefined): boolean {
  return reason === 'Bad weather' || reason === 'Weather';
}

/** A pattern is "clear" when the last 3 judged windows were skipped for a reason that suggests it, or 3 of the last 4 ran late or were missed. */
export function suggestionFor(s: TaskStats): Suggestion | null {
  const to = LESS_OFTEN[s.task.cadence];
  if (!to) return null;
  const recent = s.judged.filter((j) => ['onTime', 'late', 'missed', 'deferred'].includes(j.outcome)).slice(-4);
  let streak = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i].outcome === 'deferred' && reasonSuggests(recent[i].occ?.deferReason); i--) streak++;
  if (streak >= 3) return { task: s.task, kind: 'setAside', to, count: streak };
  const slow = recent.filter((j) => j.outcome === 'late' || j.outcome === 'missed').length;
  if (recent.length >= 4 && slow >= 3) return { task: s.task, kind: 'late', to, count: slow };
  return null;
}

export function slipOf(s: TaskStats): SlipKind | null {
  const { tally } = s;
  const judged = tally.onTime + tally.late + tally.missed;
  if (tally.deferred >= 2) return 'setAside';
  if (judged >= 2 && tally.late + tally.missed >= judged / 2 && tally.late + tally.missed >= 2) return 'late';
  if (tally.late + tally.missed >= 1) return 'behind';
  return null;
}

export function mostCommon(items: string[]): string | null {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}

/* ---------- Rhythm ---------- */

export interface Rhythm {
  /** Completions per hour, 6am–9pm (16 bars) */
  hours: number[];
  /** Completions per weekday, Monday first */
  week: number[];
  /** Average opening and closing times, minutes since midnight */
  openAt: number | null;
  closeAt: number | null;
  total: number;
}

export const RHYTHM_FIRST_HOUR = 6;
export const RHYTHM_HOURS = 16;
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function rhythm(input: AnalysisInput, from: Day, to: Day): Rhythm {
  const hours = new Array(RHYTHM_HOURS).fill(0);
  const week = new Array(7).fill(0);
  let total = 0;
  for (const o of input.occurrences) {
    if (o.status !== 'done' || !o.completedAt) continue;
    const at = new Date(o.completedAt);
    const day = doneDay(o);
    if (day < from || day > to) continue;
    total++;
    const h = at.getHours() - RHYTHM_FIRST_HOUR;
    if (h >= 0 && h < RHYTHM_HOURS) hours[h]++;
    week[MONDAY_FIRST.indexOf(at.getDay())]++;
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const logs = input.dayLogs.filter((l) => l.date >= from && l.date <= to);
  const mins = (iso?: string | null) => (iso ? new Date(iso).getHours() * 60 + new Date(iso).getMinutes() : null);
  return {
    hours,
    week,
    total,
    openAt: avg(logs.map((l) => mins(l.openingAt)).filter((x): x is number => x !== null)),
    closeAt: avg(logs.map((l) => mins(l.closingAt)).filter((x): x is number => x !== null)),
  };
}

const STRETCHES = [
  { name: 'Mornings', from: 6, to: 11 },
  { name: 'Midday', from: 11, to: 14 },
  { name: 'Afternoons', from: 14, to: 18 },
  { name: 'Evenings', from: 18, to: 22 },
];

export function dayRhythmSentence(r: Rhythm): string {
  const sums = STRETCHES.map((s) => {
    let n = 0;
    for (let h = s.from; h < s.to; h++) n += r.hours[h - RHYTHM_FIRST_HOUR] ?? 0;
    return { ...s, per: n / (s.to - s.from) };
  });
  const top = [...sums].sort((a, b) => b.per - a.per)[0];
  const low = [...sums].sort((a, b) => a.per - b.per)[0];
  if (top.name === low.name) return 'Your work is spread evenly through the day.';
  return `${top.name} are your strongest stretch, and ${low.name.toLowerCase()} ${low.name === 'Midday' ? 'is' : 'are'} a natural pause.`;
}

export function weekRhythm(r: Rhythm): { busiest: number; lightest: number; sentence: string; tip: string | null } {
  const days = MONDAY_FIRST;
  let bi = 0;
  let li = 0;
  r.week.forEach((n, i) => {
    if (n > r.week[bi]) bi = i;
    if (n < r.week[li]) li = i;
  });
  const busiest = days[bi];
  const lightest = days[li];
  const avg = r.week.reduce((a, b) => a + b, 0) / 7;
  const sentence = `${WEEKDAYS[busiest]} is your big reset day, and ${WEEKDAYS[lightest]} is your lightest.`;
  const tip =
    r.week[bi] >= Math.max(3, avg * 1.5)
      ? `${WEEKDAYS[busiest]} carries the most. Moving one weekly task to ${WEEKDAYS[lightest]} could even out your week.`
      : null;
  return { busiest, lightest, sentence, tip };
}

/** Busiest and lightest weekdays, with Saturday and Sunday as the fallback before there is enough history. */
export function resetDays(r: Rhythm): { busiest: number; lightest: number } {
  if (r.total < 7) return { busiest: 6, lightest: 0 };
  const w = weekRhythm(r);
  return { busiest: w.busiest, lightest: w.lightest };
}

/* ---------- Monthly balance ---------- */

export const MONTH_WEEKS = [
  { label: 'Week 1', range: '1st – 7th', from: 1, to: 7 },
  { label: 'Week 2', range: '8th – 14th', from: 8, to: 14 },
  { label: 'Week 3', range: '15th – 21st', from: 15, to: 21 },
  { label: 'Week 4', range: '22nd – end', from: 22, to: 31 },
];

export function weekOfMonth(day: number): number {
  if (day === -1) return 3;
  return Math.min(3, Math.floor((day - 1) / 7));
}

export function monthlySpecific(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => !t.deletedAt && !t.paused && t.cadence === 'monthly' && t.timingMode === 'specific' && typeof t.timingValue === 'number',
  );
}

export type WeekLoad = 'Fullest' | 'Steady' | 'Light' | 'Even';

export function monthBalance(tasks: Task[]): { counts: number[]; labels: WeekLoad[] } {
  const counts = [0, 0, 0, 0];
  for (const t of monthlySpecific(tasks)) counts[weekOfMonth(t.timingValue as number)]++;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const labels = counts.map((c): WeekLoad => (max === min ? 'Even' : c === max ? 'Fullest' : c === min ? 'Light' : 'Steady'));
  return { counts, labels };
}

export interface MoveSuggestion {
  from: number;
  to: number;
  moves: { task: Task; fromDay: number; toDay: number }[];
}

/** When one week carries at least three more monthly tasks than the lightest, suggest moving up to two of them. */
export function balanceSuggestion(tasks: Task[]): MoveSuggestion | null {
  const { counts } = monthBalance(tasks);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max - min < 3) return null;
  const from = counts.indexOf(max);
  // Prefer the light week across the month from the full one (week 1 → week 3, as in Figma)
  const opposite = (from + 2) % 4;
  const lightWeeks = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
  const to = lightWeeks.includes(opposite)
    ? opposite
    : lightWeeks.sort((a, b) => Math.abs(b - from) - Math.abs(a - from))[0];
  const n = Math.max(1, Math.min(2, max - min - 1));
  const candidates = monthlySpecific(tasks)
    .filter((t) => weekOfMonth(t.timingValue as number) === from)
    .sort((a, b) => (b.timingValue as number) - (a.timingValue as number))
    .slice(0, n)
    .reverse();
  const start = MONTH_WEEKS[to].from;
  return {
    from,
    to,
    moves: candidates.map((task, i) => ({ task, fromDay: task.timingValue as number, toDay: start + i })),
  };
}

/** Load per day of month (1..31): completions in the range plus where monthly tasks are set to land. */
export function monthHeat(input: AnalysisInput, from: Day, to: Day): number[] {
  const heat = new Array(32).fill(0);
  for (const o of input.occurrences) {
    if (o.status !== 'done' || !o.completedAt) continue;
    const d = doneDay(o);
    if (d < from || d > to) continue;
    const task = input.tasks.find((t) => t.id === o.taskId);
    if (!task || task.cadence === 'daily') continue;
    heat[fromDay(d).getDate()]++;
  }
  for (const t of monthlySpecific(input.tasks)) {
    const v = t.timingValue as number;
    heat[v === -1 ? 28 : v] += 1;
  }
  return heat;
}

/** 0–3 intensity for the heat map. */
export function heatLevels(heat: number[]): number[] {
  const max = Math.max(...heat.slice(1));
  return heat.map((h) => (max === 0 || h === 0 ? 0 : Math.min(3, Math.ceil((h / max) * 3))));
}

export function monthSentence(tasks: Task[]): { sentence: string; tip: string | null } {
  const { counts, labels } = monthBalance(tasks);
  if (counts.every((c) => c === 0)) {
    return { sentence: 'Monthly tasks with a set day will show where they land in your month.', tip: null };
  }
  const full = labels.indexOf('Fullest');
  const light = labels.lastIndexOf('Light');
  if (full === -1) return { sentence: 'Your monthly tasks are spread evenly across the month.', tip: null };
  const ord = ['first', 'second', 'third', 'last'];
  const sentence = `Your ${ord[full]} week is the fullest, when most monthly tasks land, and the ${ord[light]} week is the quietest.`;
  const s = balanceSuggestion(tasks);
  const tip = s
    ? `Monthly tasks cluster in the ${ord[s.from]} week. Spreading ${s.moves.length === 1 ? 'one' : 'two'} of them into week ${s.to + 1} could smooth your whole month.`
    : null;
  return { sentence, tip };
}

/* ---------- Words ---------- */

export function cadenceWord(c: Cadence): string {
  return CADENCE_LABEL[c].toLowerCase();
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function countWord(n: number): string {
  return ['no', 'once', 'twice', 'three times', 'four times', 'five times'][n] ?? `${n} times`;
}

/** Next date on or after `from` that falls on `weekday`. */
export function nextWeekday(from: Day, weekday: number): Day {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}
