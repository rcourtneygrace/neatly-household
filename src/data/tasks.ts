import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowISO, stamp } from './db';
import type { Department, RoutineTemplate, Task } from './types';
import { cleanTiming, timingIsComplete, type Timing } from '../domain/tasks';

/* ---------- Reading ---------- */

export function useTasks(): Task[] | undefined {
  return useLiveQuery(async () => (await db.tasks.toArray()).filter((t) => !t.deletedAt && !t.archived));
}

/** undefined while loading, null when it does not exist (or was deleted). */
export function useTask(id: string | undefined): Task | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const t = await db.tasks.get(id);
    return t && !t.deletedAt ? t : null;
  }, [id]);
}

export function useDepartments(): Department[] | undefined {
  return useLiveQuery(async () => (await db.departments.orderBy('order').toArray()).filter((d) => d.enabled && !d.deletedAt));
}

export function useRoutine(type: 'opening' | 'closing'): RoutineTemplate | undefined {
  return useLiveQuery(() => db.routines.where('type').equals(type).first(), [type]);
}

export function useRoutines(): { opening?: RoutineTemplate; closing?: RoutineTemplate } | undefined {
  return useLiveQuery(async () => {
    const all = await db.routines.toArray();
    return { opening: all.find((r) => r.type === 'opening'), closing: all.find((r) => r.type === 'closing') };
  });
}

/* ---------- Writing ---------- */

export interface TaskDraft extends Timing {
  name: string;
  departmentId: string;
  notes: string;
  paused: boolean;
}

export async function saveTask(draft: TaskDraft, existingId?: string): Promise<string> {
  const name = draft.name.trim();
  if (!name) throw new Error('A task needs a name.');
  if (!timingIsComplete(draft)) throw new Error('Pick when this task happens.');
  const timing = cleanTiming(draft);
  const fields = {
    name,
    departmentId: draft.departmentId,
    notes: draft.notes.trim(),
    paused: draft.paused,
    ...timing,
  };
  if (existingId) {
    await db.tasks.update(existingId, { ...fields, updatedAt: nowISO() });
    return existingId;
  }
  const row = stamp({ ...fields, steps: [] as string[], recordId: null, archived: false });
  await db.tasks.add(row);
  return row.id;
}

/** Soft delete (kept for sync) and drop any occurrences that were not done yet. */
export async function deleteTask(id: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.occurrences, async () => {
    const now = nowISO();
    await db.tasks.update(id, { deletedAt: now, updatedAt: now });
    const open = await db.occurrences.where('taskId').equals(id).filter((o) => o.status !== 'done').toArray();
    await db.occurrences.bulkDelete(open.map((o) => o.id));
  });
}

export async function saveRoutineSteps(type: 'opening' | 'closing', steps: string[]): Promise<void> {
  const routine = await db.routines.where('type').equals(type).first();
  if (!routine) return;
  const clean = steps.map((s) => s.trim()).filter(Boolean);
  await db.routines.update(routine.id, {
    steps: clean.map((text, order) => ({ text, order })),
    updatedAt: nowISO(),
  });
}
