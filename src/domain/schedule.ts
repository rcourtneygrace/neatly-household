import type { Cadence, Occurrence, SeasonName, Task } from '../data/types';
import { LAST_DAY, MONTHS, SEASONS, SEASON_LABEL, WEEKDAYS } from './tasks';
import {
  addDays,
  daysBetween,
  fromDay,
  lastDayOfMonth,
  makeDay,
  monthShort,
  shortDate,
  toDay,
  weekdayOf,
  type Day,
} from './dates';

/**
 * The scheduling engine. Tasks are turned into "instances" (one per period, or one per due
 * date) on the fly; only what the person does is stored, as Occurrence rows keyed by
 * taskId + instance key. Pure functions, no database.
 *
 * Rules (from the plan the owner approved):
 * - Tasks with a set day show 4 days before it, quietly with the date; Heads up 2 days before;
 *   Today on the day; Priority once the day has passed.
 * - "Every week / month / season / year" tasks show for their whole period with no tag.
 * - Anything left undone when its window ends is carried over with Priority (never "overdue").
 * - Deferred (set aside) instances are not carried over.
 */

export interface PlanCalendar {
  weekStart: number;
  monthStart: number;
  yearStart: number;
  seasonStartDates: Record<SeasonName, string>;
}

export interface Instance {
  /** Stored as Occurrence.periodStart */
  key: Day;
  /** First day it shows on Today */
  start: Day;
  /** Last day of its window; undone after this it is carried over */
  end: Day;
  /** The set day, for tasks that have one */
  due: Day | null;
}

export const RUNWAY_DAYS = 4;
export const HEADS_UP_DAYS = 2;

/* ---------- Periods ---------- */

export function periodFor(cadence: Cadence, day: Day, cal: PlanCalendar): { start: Day; end: Day } {
  switch (cadence) {
    case 'daily':
      return { start: day, end: day };
    case 'weekly': {
      const start = addDays(day, -((weekdayOf(day) - cal.weekStart + 7) % 7));
      return { start, end: addDays(start, 6) };
    }
    case 'monthly': {
      const d = fromDay(day);
      const startOf = (y: number, m: number) => {
        const yy = y + Math.floor(m / 12);
        const mm = ((m % 12) + 12) % 12;
        return makeDay(yy, mm, Math.min(cal.monthStart, lastDayOfMonth(yy, mm)));
      };
      let y = d.getFullYear();
      let m = d.getMonth();
      if (startOf(y, m) > day) m -= 1;
      if (m < 0) {
        m += 12;
        y -= 1;
      }
      return { start: startOf(y, m), end: addDays(startOf(y, m + 1), -1) };
    }
    case 'seasonal': {
      const starts = seasonStartsAround(fromDay(day).getFullYear(), cal);
      let i = starts.length - 1;
      while (i > 0 && starts[i].start > day) i--;
      return { start: starts[i].start, end: addDays(starts[i + 1].start, -1) };
    }
    case 'yearly': {
      const y = fromDay(day).getFullYear();
      const thisYear = makeDay(y, cal.yearStart, 1);
      const start = thisYear <= day ? thisYear : makeDay(y - 1, cal.yearStart, 1);
      const sy = fromDay(start).getFullYear();
      return { start, end: addDays(makeDay(sy + 1, cal.yearStart, 1), -1) };
    }
  }
}

function seasonStartsAround(year: number, cal: PlanCalendar): { season: SeasonName; start: Day }[] {
  const out: { season: SeasonName; start: Day }[] = [];
  for (let y = year - 2; y <= year + 2; y++) {
    for (const s of SEASONS) {
      const [m, d] = cal.seasonStartDates[s].split('-').map(Number);
      out.push({ season: s, start: makeDay(y, m - 1, Math.min(d, lastDayOfMonth(y, m - 1))) });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- Instances ---------- */

function dueInstance(due: Day): Instance {
  return { key: due, start: addDays(due, -RUNWAY_DAYS), end: due, due };
}

/** The task's instances around a day: enough to find the current, the last and the next one. */
export function instancesAround(task: Task, day: Day, cal: PlanCalendar): Instance[] {
  const v = task.timingValue;
  const every = task.cadence === 'daily' || task.timingMode === 'every' || v === null;
  let list: Instance[] = [];

  if (every) {
    const cur = periodFor(task.cadence, day, cal);
    const prev = periodFor(task.cadence, addDays(cur.start, -1), cal);
    const next = periodFor(task.cadence, addDays(cur.end, 1), cal);
    list = [prev, cur, next].map((p) => ({ key: p.start, start: p.start, end: p.end, due: null }));
  } else if (task.cadence === 'weekly') {
    for (const wd of v as number[]) {
      const first = addDays(day, (wd - weekdayOf(day) + 7) % 7);
      for (const k of [-14, -7, 0, 7]) list.push(dueInstance(addDays(first, k)));
    }
  } else if (task.cadence === 'monthly') {
    const d = fromDay(day);
    for (let k = -2; k <= 2; k++) {
      const first = new Date(d.getFullYear(), d.getMonth() + k, 1);
      const y = first.getFullYear();
      const m = first.getMonth();
      const last = lastDayOfMonth(y, m);
      list.push(dueInstance(makeDay(y, m, v === LAST_DAY ? last : Math.min(v as number, last))));
    }
  } else if (task.cadence === 'seasonal') {
    const starts = seasonStartsAround(fromDay(day).getFullYear(), cal);
    starts.forEach((s, i) => {
      if ((v as SeasonName[]).includes(s.season) && starts[i + 1]) {
        list.push({ key: s.start, start: s.start, end: addDays(starts[i + 1].start, -1), due: null });
      }
    });
  } else if (task.cadence === 'yearly') {
    const y = fromDay(day).getFullYear();
    for (let yy = y - 1; yy <= y + 1; yy++) {
      const m = v as number;
      list.push({ key: makeDay(yy, m, 1), start: makeDay(yy, m, 1), end: makeDay(yy, m, lastDayOfMonth(yy, m)), due: null });
    }
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- Today ---------- */

export type Tag = 'priority' | 'today' | 'headsUp';

/**
 * daily: Daily Tasks. locked: fixed for today (a set day that is today, or pushed to today).
 * picked: chosen in Build Your Day (or carried over from an earlier pick). offer: not on today's
 * list; offered in Build Your Day.
 */
export type ItemKind = 'daily' | 'locked' | 'picked' | 'offer';

export interface TodayItem {
  task: Task;
  inst: Instance;
  kind: ItemKind;
  tag: Tag | null;
  /** Checked off today (shown crossed out) */
  done: boolean;
  /** On today's list because it was picked (Build Your Day) */
  planned: boolean;
  /** A missed window, carried over: offered first in Build Your Day */
  priority: boolean;
  /** The missed instance this row carries over (its date is the one shown) */
  carriedFrom?: Instance;
  /** A pick from an earlier day that is still unfinished ("Carried over") */
  carriedPick?: boolean;
}

export interface ComingSoonGroup {
  label: string;
  items: { task: Task; when: Day; pill: string }[];
}

export interface TodayView {
  daily: TodayItem[];
  /** Today's list: locked tasks and picks (and anything checked off today) */
  inProgress: TodayItem[];
  /** Not on today's list; what Build Your Day offers, by the rules in the Build Your Day doc */
  offers: TodayItem[];
  comingSoon: ComingSoonGroup[];
}

export interface VacationSpan {
  startDate: Day;
  endDate: Day | null;
}

export interface TodayInput {
  today: Day;
  tasks: Task[];
  occurrences: Occurrence[];
  cal: PlanCalendar;
  clearWhenChecked: boolean;
  /** Days the household was opened; a daily task rolls over as Priority only after an opened day. */
  openedDays: Set<Day>;
  /** Vacation periods: nothing that ends inside one is carried over or counted */
  vacations?: VacationSpan[];
}

export function occKey(taskId: string, key: Day): string {
  return `${taskId}|${key}`;
}

function activeSince(task: Task): Day {
  return task.activeSince ?? toDay(new Date(task.createdAt));
}

function completedOn(o: Occurrence | undefined): Day | null {
  return o?.status === 'done' && o.completedAt ? doneDay(o) : null;
}

/** The household day a completion counts for. Older rows only have the time. */
export function doneDay(o: Occurrence): Day {
  return o.completedOn ?? toDay(new Date(o.completedAt!));
}

export function inVacation(day: Day, vacations: VacationSpan[] | undefined, today: Day): boolean {
  return !!vacations?.some((v) => v.startDate <= day && day <= (v.endDate ?? today));
}

function vacationBetween(from: Day, to: Day, vacations: VacationSpan[] | undefined, today: Day): boolean {
  return !!vacations?.some((v) => v.startDate <= to && (v.endDate ?? today) >= from);
}

/** How far ahead a set day may be for Build Your Day to offer it (doc: weekly 2, monthly 4, seasonal and yearly 7). */
const OFFER_DAYS: Record<Cadence, number> = { daily: 0, weekly: 2, monthly: 4, seasonal: 7, yearly: 7 };

function occInstance(o: Occurrence): Instance {
  return { key: o.periodStart, start: o.periodStart, end: o.periodEnd, due: o.dueDate ?? null };
}

export function buildToday(input: TodayInput): TodayView {
  const { today: T, cal, vacations } = input;
  const occ = new Map(input.occurrences.map((o) => [occKey(o.taskId, o.periodStart), o]));
  const byTask = new Map<string, Occurrence[]>();
  for (const o of input.occurrences) {
    const list = byTask.get(o.taskId) ?? [];
    list.push(o);
    byTask.set(o.taskId, list);
  }
  const get = (t: Task, i: Instance | undefined) => (i ? occ.get(occKey(t.id, i.key)) : undefined);

  const daily: TodayItem[] = [];
  const inProgress: TodayItem[] = [];
  const offers: TodayItem[] = [];
  const soon: { task: Task; when: Day }[] = [];

  for (const task of input.tasks) {
    if (task.paused || task.archived || task.deletedAt) continue;
    const since = activeSince(task);
    const own = byTask.get(task.id) ?? [];

    if (task.cadence === 'daily') {
      const inst: Instance = { key: T, start: T, end: T, due: null };
      const o = get(task, inst);
      if (o?.status === 'deferred') continue;
      const yesterday = addDays(T, -1);
      const y = occ.get(occKey(task.id, yesterday));
      const priority =
        o?.status !== 'done' &&
        yesterday >= since &&
        input.openedDays.has(yesterday) &&
        !inVacation(yesterday, vacations, T) &&
        y?.status !== 'done' &&
        y?.status !== 'deferred';
      daily.push({
        task,
        inst,
        kind: 'daily',
        tag: priority ? 'priority' : null,
        done: o?.status === 'done',
        planned: false,
        priority,
      });
      continue;
    }

    // Pushed to a later day: off today's list and not offered until then
    if (own.some((o) => o.pinned && o.status === 'open' && o.plannedFor && o.plannedFor > T)) continue;

    const insts = instancesAround(task, T, cal);
    const cur = insts.find((i) => i.start <= T && T <= i.end);
    const last = [...insts].reverse().find((i) => i.end < T);
    const next = insts.find((i) => i.start > T);
    const missed = (i: Instance | undefined) => {
      if (!i || i.end < since || inVacation(i.end, vacations, T)) return false;
      const o = get(task, i);
      if (o?.pinned) return false; // a pushed day is never carried over
      return o?.status !== 'done' && o?.status !== 'deferred';
    };
    const curOcc = get(task, cur);

    let row: TodayItem | null = null;
    const doneToday = own.find((o) => completedOn(o) === T);
    const pinnedToday = own.find((o) => o.pinned && o.plannedFor === T && o.status === 'open');
    const pickedToday = own.find((o) => !o.pinned && o.plannedFor === T && o.status === 'open');
    const carried = own
      .filter(
        (o) =>
          o.plannedFor &&
          o.plannedFor < T &&
          o.status === 'open' &&
          !vacationBetween(o.plannedFor, T, vacations, T) &&
          !(cur && curOcc?.status === 'done'),
      )
      .sort((a, b) => (b.plannedFor ?? '').localeCompare(a.plannedFor ?? ''))[0];

    if (doneToday) {
      const kind: ItemKind = doneToday.pinned || doneToday.dueDate === T ? 'locked' : 'picked';
      row = { task, inst: occInstance(doneToday), kind, done: true, planned: kind === 'picked', priority: false, tag: null };
    } else if (pinnedToday) {
      row = { task, inst: occInstance(pinnedToday), kind: 'locked', done: false, planned: false, priority: false, tag: null };
    } else if (cur?.due === T && curOcc?.status !== 'deferred' && curOcc?.status !== 'done') {
      row = { task, inst: cur, kind: 'locked', done: false, planned: false, priority: false, tag: null };
    } else if (pickedToday) {
      const inst = occInstance(pickedToday);
      const isLast = last && inst.key === last.key;
      row = { task, inst, kind: 'picked', done: false, planned: true, priority: !!isLast, tag: null };
    } else if (carried) {
      row = { task, inst: occInstance(carried), kind: 'picked', done: false, planned: true, priority: false, carriedPick: true, tag: null };
    }

    if (row) {
      row.tag = tagFor(row, T);
      if (!(row.done && input.clearWhenChecked)) inProgress.push(row);
      continue;
    }

    // Not on today's list: what Build Your Day may offer
    let offer: TodayItem | null = null;
    if (cur && curOcc?.status !== 'deferred' && curOcc?.status !== 'done') {
      const carriedOver = missed(last);
      offer = {
        task,
        inst: cur,
        kind: 'offer',
        done: false,
        planned: false,
        priority: carriedOver,
        carriedFrom: carriedOver ? last : undefined,
        tag: null,
      };
    } else if (missed(last) && !(cur && curOcc?.status === 'done')) {
      offer = { task, inst: last!, kind: 'offer', done: false, planned: false, priority: true, tag: null };
    }
    if (offer) {
      const due = offer.inst.due;
      const near = !due || offer.priority || (daysBetween(T, due) >= 1 && daysBetween(T, due) <= OFFER_DAYS[task.cadence]);
      if (near) {
        offer.tag = tagFor(offer, T);
        offers.push(offer);
        continue;
      }
    }
    if (next && (task.cadence === 'monthly' || task.cadence === 'seasonal' || task.cadence === 'yearly')) {
      soon.push({ task, when: next.due ?? next.start });
    }
  }

  daily.sort((a, b) => a.task.name.localeCompare(b.task.name));
  inProgress.sort((a, b) => rank(a) - rank(b) || a.task.name.localeCompare(b.task.name));
  offers.sort(
    (a, b) =>
      offerRank(a, T) - offerRank(b, T) ||
      (a.inst.due ?? a.inst.end).localeCompare(b.inst.due ?? b.inst.end) ||
      a.task.name.localeCompare(b.task.name),
  );

  return { daily, inProgress, offers, comingSoon: groupComingSoon(soon, T) };
}

function tagFor(item: TodayItem, T: Day): Tag | null {
  if (item.done || item.carriedPick) return null;
  if (item.priority) return 'priority';
  if (item.kind === 'locked' || item.kind === 'picked') return 'today';
  if (item.inst.due) {
    const d = daysBetween(T, item.inst.due);
    if (d === 0) return 'today';
    if (d <= HEADS_UP_DAYS) return 'headsUp';
  }
  return null;
}

/** Today's list: Priority picks, then locked, then picks, then carried-over picks. Done rows keep their place. */
function rank(i: TodayItem): number {
  if (i.priority) return 0;
  if (i.kind === 'locked') return 1;
  if (i.carriedPick) return 3;
  return 2;
}

/** Build Your Day order: Priority, then Heads up, then the rest. */
export function offerRank(i: TodayItem, T: Day): number {
  if (i.priority) return 0;
  if (i.inst.due && daysBetween(T, i.inst.due) <= HEADS_UP_DAYS) return 1;
  return 2;
}

function groupComingSoon(items: { task: Task; when: Day }[], T: Day): ComingSoonGroup[] {
  const t = fromDay(T);
  const nextMonth = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const thisMonth: ComingSoonGroup = { label: 'Later this month', items: [] };
  const next: ComingSoonGroup = { label: `Next month · ${MONTHS[nextMonth.getMonth()]}`, items: [] };
  const later: ComingSoonGroup = { label: 'Later this year', items: [] };
  for (const { task, when } of items.sort((a, b) => a.when.localeCompare(b.when) || a.task.name.localeCompare(b.task.name))) {
    const w = fromDay(when);
    if (w.getFullYear() === t.getFullYear() && w.getMonth() === t.getMonth()) {
      thisMonth.items.push({ task, when, pill: shortDate(when) });
    } else if (w.getFullYear() === nextMonth.getFullYear() && w.getMonth() === nextMonth.getMonth()) {
      next.items.push({ task, when, pill: monthShort(when) });
    } else if (w.getFullYear() === t.getFullYear()) {
      later.items.push({ task, when, pill: monthShort(when) });
    }
  }
  return [thisMonth, next, later].filter((g) => g.items.length > 0);
}

/* ---------- Labels for Today rows (Figma: "Kitchen · 1st of month · Oct 1") ---------- */

export function cadenceShort(task: Task): string {
  const v = task.timingValue;
  if (task.cadence === 'daily') return 'Daily';
  if (task.timingMode === 'every' || v === null) {
    return { weekly: 'Weekly', monthly: 'Monthly', seasonal: 'Seasonal', yearly: 'Yearly' }[task.cadence];
  }
  switch (task.cadence) {
    case 'weekly':
      return (v as number[]).map((d) => `${WEEKDAYS[d]}s`).join(', ');
    case 'monthly':
      return v === LAST_DAY ? 'Last day of month' : `${ordinalShort(v as number)} of month`;
    case 'seasonal':
      return `Every ${(v as SeasonName[]).map((s) => SEASON_LABEL[s]).join(', ')}`;
    case 'yearly':
      return `Every ${MONTHS[v as number]}`;
  }
}

function ordinalShort(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

export interface RowMeta {
  /** Plain part, e.g. "Kitchen · Monthly" */
  text: string;
  /** Emphasised part in clay, e.g. "Oct 17", "Sunday", "Today" */
  emphasis?: string;
  /** Whole line in clay (Priority rows) */
  clay: boolean;
}

export function rowMeta(item: TodayItem, department: string, T: Day): RowMeta {
  const label = cadenceShort(item.task);
  const due = item.inst.due;
  if (item.carriedPick && !item.done) return { text: `${department} · ${label} · `, emphasis: 'Carried over', clay: false };
  if (item.priority && !item.done) {
    const missedDue = item.carriedFrom ? item.carriedFrom.due : due;
    return { text: missedDue ? `${department} · ${label} · ${shortDate(missedDue)}` : `${department} · ${label}`, clay: true };
  }
  if (due && !item.done && daysBetween(T, due) >= 0) {
    const d = daysBetween(T, due);
    const when = d === 0 ? 'Today' : item.task.cadence === 'weekly' && d < 7 ? WEEKDAYS[weekdayOf(due)] : shortDate(due);
    return { text: `${department} · `, emphasis: when, clay: false };
  }
  return { text: `${department} · ${label}`, clay: false };
}

/** "Kitchen · Monthly", with no dates or emphasis (done rows, Coming Soon, the review panel). */
export function plainMeta(task: Task, department: string): string {
  return `${department} · ${cadenceShort(task)}`;
}

/** What Build Your Day offers. */
export function buildCandidates(view: TodayView): TodayItem[] {
  return view.offers;
}
