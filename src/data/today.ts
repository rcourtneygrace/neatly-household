import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowISO, stamp } from './db';
import type { DayLog, Department, Household, Occurrence, RoutineTemplate, Task } from './types';
import { addDays, type Day } from '../domain/dates';
import type { Instance, TodayItem } from '../domain/schedule';

export interface TodayData {
  household: Household;
  tasks: Task[];
  departments: Department[];
  occurrences: Occurrence[];
  dayLogs: DayLog[];
  routines: { opening?: RoutineTemplate; closing?: RoutineTemplate };
}

/** Everything the Today screen needs, kept live. Occurrences from the last ~13 months are enough for any carry-over. */
export function useTodayData(today: Day): TodayData | undefined {
  return useLiveQuery(async () => {
    const household = await db.household.toCollection().first();
    if (!household) return undefined;
    const [tasks, departments, occurrences, dayLogs, routines] = await Promise.all([
      db.tasks.toArray(),
      db.departments.orderBy('order').toArray(),
      db.occurrences.where('periodStart').aboveOrEqual(addDays(today, -400)).toArray(),
      db.dayLogs.where('date').aboveOrEqual(addDays(today, -7)).toArray(),
      db.routines.toArray(),
    ]);
    return {
      household,
      tasks: tasks.filter((t) => !t.deletedAt && !t.archived),
      departments,
      occurrences: occurrences.filter((o) => !o.deletedAt),
      dayLogs,
      routines: { opening: routines.find((r) => r.type === 'opening'), closing: routines.find((r) => r.type === 'closing') },
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
export async function setDone(item: TodayItem, done: boolean): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    await upsert(item.task.id, item.inst, done ? { status: 'done', completedAt: nowISO() } : { status: 'open', completedAt: null });
    if (item.carriedFrom) {
      await upsert(item.task.id, item.carriedFrom, { status: done ? 'carriedOver' : 'open' });
    }
  });
}

export const DEFER_REASONS = ['Weather', 'Away from home', 'Waiting on something', 'Not needed this time'];

/** Set a task aside for this period. It leaves Priority and is not carried over. */
export async function deferItem(item: TodayItem, reason: string): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    await upsert(item.task.id, item.inst, { status: 'deferred', deferReason: reason });
    if (item.carriedFrom) await upsert(item.task.id, item.carriedFrom, { status: 'deferred', deferReason: reason });
  });
}

/** Build Your Day: mark the picked tasks for today (Today tag, top of In Progress). */
export async function planForToday(items: TodayItem[], today: Day): Promise<void> {
  await db.transaction('rw', db.occurrences, async () => {
    for (const i of items) await upsert(i.task.id, i.inst, { plannedFor: today });
  });
}

export async function unplan(item: TodayItem): Promise<void> {
  await upsert(item.task.id, item.inst, { plannedFor: null });
}

async function dayLog(date: Day): Promise<DayLog> {
  const existing = await db.dayLogs.where('date').equals(date).first();
  if (existing) return existing;
  const row = stamp({
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

/** Undo a mistaken "Mark closing complete" (reopens the day). */
export async function reopenDay(date: Day): Promise<void> {
  const log = await db.dayLogs.where('date').equals(date).first();
  if (log) await db.dayLogs.update(log.id, { closingStatus: 'open', closingAt: null, updatedAt: nowISO() });
}
