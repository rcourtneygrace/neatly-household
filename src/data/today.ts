import { useLiveQuery } from 'dexie-react-hooks';
import { dayLogId, db, nowISO, occurrenceId, stamp } from './db';
import type { DayLog, Department, Household, Occurrence, RoutineTemplate, Task, VacationPeriod } from './types';
import { addDays, type Day } from '../domain/dates';
import type { Instance, TodayItem } from '../domain/schedule';

export interface TodayData {
  household: Household;
  tasks: Task[];
  departments: Department[];
  occurrences: Occurrence[];
  dayLogs: DayLog[];
  routines: { opening?: RoutineTemplate; closing?: RoutineTemplate };
  vacations: VacationPeriod[];
}

/** Everything the Today screen needs, kept live. Occurrences from the last ~13 months are enough for any carry-over. */
export function useTodayData(today: Day): TodayData | undefined {
  return useLiveQuery(async () => {
    const household = await db.household.toCollection().first();
    if (!household) return undefined;
    const [tasks, departments, occurrences, dayLogs, routines, vacations] = await Promise.all([
      db.tasks.toArray(),
      db.departments.orderBy('order').toArray(),
      db.occurrences.where('periodStart').aboveOrEqual(addDays(today, -400)).toArray(),
      // ~2 months of day logs: Build Your Day ranks by what was picked before
      db.dayLogs.where('date').aboveOrEqual(addDays(today, -60)).toArray(),
      db.routines.toArray(),
      db.vacations.toArray(),
    ]);
    return {
      household,
      tasks: tasks.filter((t) => !t.deletedAt && !t.archived),
      departments,
      occurrences: occurrences.filter((o) => !o.deletedAt),
      dayLogs,
      routines: { opening: routines.find((r) => r.type === 'opening'), closing: routines.find((r) => r.type === 'closing') },
      vacations: vacations.filter((v) => !v.deletedAt),
    };
  }, [today]);
}

async function upsert(taskId: string, inst: Instance, changes: Partial<Occurrence>): Promise<void> {
  const existing = await db.occurrences.where('[taskId+periodStart]').equals([taskId, inst.key]).first();
  if (existing) {
    await db.occurrences.update(existing.id, { ...changes, updatedAt: nowISO() });
  } else {
    await db.occurrences.add(
      stamp({
        id: occurrenceId(taskId, inst.key),
        taskId,
        periodStart: inst.key,
        periodEnd: inst.end,
        dueDate: inst.due,
        status: 'open' as const,
        ...changes,
      }),
    );
  }
}

/** Check a task off (or un-check it). A carried-over row also records the missed instance as carried over. */
export async function setDone(item: TodayItem, done: boolean, day: Day): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    await upsert(
      item.task.id,
      item.inst,
      done ? { status: 'done', completedAt: nowISO(), completedOn: day } : { status: 'open', completedAt: null, completedOn: null },
    );
    if (item.carriedFrom) {
      await upsert(item.task.id, item.carriedFrom, { status: done ? 'carriedOver' : 'open' });
    }
  });
}

/**
 * Skip reasons (Build Your Day doc). `suggests` marks the reasons that may lead Analysis to ask
 * "Would this fit better as a … task?". Life getting in the way never does.
 */
export const SKIP_REASONS: { label: string; suggests: boolean }[] = [
  { label: "I'm sick", suggests: false },
  { label: 'Bad weather', suggests: false },
  { label: 'Something came up', suggests: false },
  { label: 'Not needed this time', suggests: true },
  { label: 'No time', suggests: true },
  { label: 'Other', suggests: true },
];

/** Anything to restore with Undo. */
export type UndoSnapshot = { id: string; before: Occurrence | null }[];

async function snapshot(taskId: string, keys: string[]): Promise<UndoSnapshot> {
  const out: UndoSnapshot = [];
  for (const key of keys) {
    const o = await db.occurrences.where('[taskId+periodStart]').equals([taskId, key]).first();
    out.push({ id: o?.id ?? `${taskId}|${key}`, before: o ?? null });
  }
  return out;
}

export async function undo(snap: UndoSnapshot): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    for (const s of snap) {
      if (s.before) await db.occurrences.put(s.before);
      else {
        const [taskId, key] = s.id.split('|');
        const o = await db.occurrences.where('[taskId+periodStart]').equals([taskId, key]).first();
        if (o) await db.occurrences.delete(o.id);
      }
    }
  });
}

/**
 * Skip a task for the rest of its cycle (stored as status "deferred"). It is not Priority and not
 * carried over; it comes back at the next reset. `reason` is null for "Skip without a reason".
 */
export async function skipItem(item: TodayItem, reason: string | null): Promise<UndoSnapshot> {
  const keys = [item.inst.key, ...(item.carriedFrom ? [item.carriedFrom.key] : [])];
  const snap = await snapshot(item.task.id, keys);
  await db.transaction('rw', db.occurrences, async () => {
    await upsert(item.task.id, item.inst, { status: 'deferred', deferReason: reason, plannedFor: null, pinned: false });
    if (item.carriedFrom) await upsert(item.task.id, item.carriedFrom, { status: 'deferred', deferReason: reason });
  });
  return snap;
}

/**
 * Push to a later date: off today's list, and locked on the chosen day. It is not Priority and not
 * carried over meanwhile. A one-time move; the usual schedule is unchanged. A daily task is skipped
 * for today and simply shows as usual on that day.
 */
export async function pushTo(item: TodayItem, day: Day): Promise<void> {
  if (item.task.cadence === 'daily') {
    await upsert(item.task.id, item.inst, { status: 'deferred', deferReason: null, plannedFor: day, pinned: true });
    return;
  }
  await db.transaction('rw', db.occurrences, async () => {
    await upsert(item.task.id, item.inst, { status: 'open', plannedFor: day, pinned: true, deferReason: null });
    if (item.carriedFrom) await upsert(item.task.id, item.carriedFrom, { status: 'carriedOver' });
  });
}

/** Build Your Day: put the picked tasks on today's list. */
export async function planForToday(items: TodayItem[], today: Day): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    for (const i of items) await upsert(i.task.id, i.inst, { plannedFor: today, pinned: false });
  });
}

/**
 * Finish Build Your Day: picks go on today's list, dropped picks come off it, and the day's list
 * (locked and chosen) is saved on the day log for Analysis.
 */
export async function buildDay(
  today: Day,
  picked: TodayItem[],
  dropped: TodayItem[],
  locked: TodayItem[],
): Promise<void> {
  await db.transaction('rw', db.occurrences, db.dayLogs, async () => {
    for (const i of picked) await upsert(i.task.id, i.inst, { plannedFor: today, pinned: false });
    for (const d of dropped) await upsert(d.task.id, d.inst, { plannedFor: null });
    const log = await dayLog(today);
    await db.dayLogs.update(log.id, {
      dayBuilt: true,
      picks: [
        ...locked.map((i) => ({ taskId: i.task.id, kind: 'locked' as const })),
        ...picked.map((i) => ({ taskId: i.task.id, kind: 'chosen' as const })),
      ],
      updatedAt: nowISO(),
    });
  });
}

/** Build Your Day closed without building: Today shows a quiet "Plan my day" instead. */
export async function dismissBuildDay(today: Day): Promise<void> {
  await db.transaction('rw', db.dayLogs, async () => {
    const log = await dayLog(today);
    await db.dayLogs.update(log.id, { dayDismissed: true, updatedAt: nowISO() });
  });
}

/* ---------- Vacation mode ---------- */

export async function startVacation(today: Day): Promise<void> {
  const open = (await db.vacations.toArray()).find((v) => !v.deletedAt && v.endDate === null);
  if (!open) await db.vacations.add(stamp({ startDate: today, endDate: null, welcomeSeen: false }));
}

export async function endVacation(today: Day): Promise<void> {
  const open = (await db.vacations.toArray()).filter((v) => !v.deletedAt && v.endDate === null);
  for (const v of open) await db.vacations.update(v.id, { endDate: today, updatedAt: nowISO() });
}

export async function dismissWelcomeBack(id: string): Promise<void> {
  await db.vacations.update(id, { welcomeSeen: true, updatedAt: nowISO() });
}

export async function unplan(item: TodayItem): Promise<void> {
  await upsert(item.task.id, item.inst, { plannedFor: null });
}

async function dayLog(date: Day): Promise<DayLog> {
  const existing = await db.dayLogs.where('date').equals(date).first();
  if (existing) return existing;
  const row = stamp({
    id: dayLogId(date),
    date,
    openingStatus: 'open' as const,
    closingStatus: 'open' as const,
    tasksPlanned: 0,
    tasksCompleted: 0,
  });
  await db.dayLogs.add(row);
  return row;
}

export async function completeOpening(date: Day): Promise<void> {
  await db.transaction('rw', db.dayLogs, async () => {
    const log = await dayLog(date);
    await db.dayLogs.update(log.id, { openingStatus: 'done', openingAt: nowISO(), updatedAt: nowISO() });
  });
}

export async function completeClosing(date: Day, counts: { planned: number; completed: number }): Promise<void> {
  await db.transaction('rw', db.dayLogs, async () => {
    const log = await dayLog(date);
    await db.dayLogs.update(log.id, {
      closingStatus: 'done',
      closingAt: nowISO(),
      tasksPlanned: counts.planned,
      tasksCompleted: counts.completed,
      updatedAt: nowISO(),
    });
  });
}

/** "Open early": start the calendar day's household day before its opening time. */
export async function startDayEarly(date: Day): Promise<void> {
  await db.transaction('rw', db.dayLogs, async () => {
    const log = await dayLog(date);
    await db.dayLogs.update(log.id, { startedEarly: true, updatedAt: nowISO() });
  });
}

/** Undo a mistaken "Mark closing complete" (reopens the day). */
export async function reopenDay(date: Day): Promise<void> {
  const log = await db.dayLogs.where('date').equals(date).first();
  if (log) await db.dayLogs.update(log.id, { closingStatus: 'open', closingAt: null, updatedAt: nowISO() });
}
