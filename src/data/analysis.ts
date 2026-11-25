import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowISO, stamp } from './db';
import type { Department, Household, Task } from './types';
import { addDays, type Day } from '../domain/dates';
import { buildToday, instancesAround, type Instance, type PlanCalendar } from '../domain/schedule';
import type { AnalysisInput } from '../domain/analysis';

/** Tasks, occurrences and day logs from the last ~13 months, kept live. */
export interface AnalysisData extends AnalysisInput {
  departments: Department[];
  household: Household;
}

export function useAnalysisData(today: Day): AnalysisData | undefined {
  return useLiveQuery(async () => {
    const household = await db.household.toCollection().first();
    if (!household) return undefined;
    const from = addDays(today, -400);
    const [tasks, departments, occurrences, dayLogs, vacations] = await Promise.all([
      db.tasks.toArray(),
      db.departments.orderBy('order').toArray(),
      db.occurrences.where('periodStart').aboveOrEqual(from).toArray(),
      db.dayLogs.where('date').aboveOrEqual(from).toArray(),
      db.vacations.toArray(),
    ]);
    return {
      today,
      household,
      cal: household,
      tasks: tasks.filter((t) => !t.deletedAt && !t.archived),
      departments,
      occurrences: occurrences.filter((o) => !o.deletedAt),
      dayLogs,
      vacations: vacations.filter((v) => !v.deletedAt),
    };
  }, [today]);
}

/** The instance a task would be on a given day: the one showing then, else the next one. */
async function instanceOn(task: Task, day: Day, cal: PlanCalendar): Promise<Instance> {
  const occurrences = await db.occurrences.where('taskId').equals(task.id).toArray();
  const view = buildToday({ today: day, tasks: [task], occurrences, cal, clearWhenChecked: false, openedDays: new Set() });
  const row = [...view.daily, ...view.inProgress][0];
  if (row) return row.inst;
  const insts = instancesAround(task, day, cal);
  return insts.find((i) => i.start <= day && day <= i.end) ?? insts.find((i) => i.start > day) ?? insts[insts.length - 1];
}

/**
 * "Give it a day": plan one catch-up day for a task. On that day it shows at the top of
 * In Progress with a Today tag. Its usual schedule does not change. A set-aside instance is
 * brought back (it leaves Priority once it has a day).
 */
export async function giveItADay(task: Task, day: Day, cal: PlanCalendar): Promise<void> {
  const inst = await instanceOn(task, day, cal);
  await db.transaction('rw', db.occurrences, async () => {
    const existing = await db.occurrences.where('[taskId+periodStart]').equals([task.id, inst.key]).first();
    const changes = { plannedFor: day, pinned: true, ...(existing?.status === 'deferred' ? { status: 'open' as const, deferReason: null } : {}) };
    if (existing) await db.occurrences.update(existing.id, { ...changes, updatedAt: nowISO() });
    else
      await db.occurrences.add(
        stamp({ taskId: task.id, periodStart: inst.key, periodEnd: inst.end, dueDate: inst.due, status: 'open' as const, ...changes }),
      );
  });
}

/** Adjust monthly tasks: move the chosen tasks to new days of the month. */
export async function moveMonthlyTasks(moves: { taskId: string; toDay: number }[]): Promise<void> {
  const today = new Date();
  const activeSince = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await db.transaction('rw', db.tasks, async () => {
    for (const m of moves) await db.tasks.update(m.taskId, { timingValue: m.toDay, activeSince, updatedAt: nowISO() });
  });
}

