import { beforeEach, describe, expect, it } from 'vitest';
import { db, stamp } from './db';
import { ensureSeeded } from './seed';
import { deleteTask, saveRoutineSteps, saveTask } from './tasks';
import { loadSuggestedTasks } from './suggestedTasks';

let kitchen: string;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded();
  kitchen = (await db.departments.where('order').equals(0).first())!.id;
});

const draft = {
  name: 'Clean the fridge',
  departmentId: '',
  notes: '',
  paused: false,
  cadence: 'weekly' as const,
  timingMode: 'specific' as const,
  timingValue: [3],
};

describe('saveTask', () => {
  it('adds and edits a task', async () => {
    const id = await saveTask({ ...draft, departmentId: kitchen });
    expect((await db.tasks.get(id))?.timingValue).toEqual([3]);
    await saveTask({ ...draft, departmentId: kitchen, cadence: 'monthly', timingMode: 'every', timingValue: null, paused: true }, id);
    const t = (await db.tasks.get(id))!;
    expect(t.cadence).toBe('monthly');
    expect(t.timingValue).toBeNull();
    expect(t.paused).toBe(true);
  });

  it('clears the timing value for daily tasks', async () => {
    const id = await saveTask({ ...draft, departmentId: kitchen, cadence: 'daily' });
    expect((await db.tasks.get(id))?.timingValue).toBeNull();
  });

  it('refuses a task with no name or no day', async () => {
    await expect(saveTask({ ...draft, departmentId: kitchen, name: ' ' })).rejects.toThrow();
    await expect(saveTask({ ...draft, departmentId: kitchen, timingValue: [] })).rejects.toThrow();
  });
});

describe('deleteTask', () => {
  it('soft-deletes the task and drops its unfinished occurrences, keeping done ones', async () => {
    const id = await saveTask({ ...draft, departmentId: kitchen });
    await db.occurrences.bulkAdd([
      stamp({ taskId: id, periodStart: '2026-10-11', periodEnd: '2026-10-17', status: 'done' as const }),
      stamp({ taskId: id, periodStart: '2026-10-18', periodEnd: '2026-10-24', status: 'open' as const }),
    ]);
    await deleteTask(id);
    expect((await db.tasks.get(id))?.deletedAt).toBeTruthy();
    expect((await db.occurrences.toArray()).map((o) => o.status)).toEqual(['done']);
  });
});

describe('routines', () => {
  it('saves steps in order and drops blank ones', async () => {
    await saveRoutineSteps('opening', ['Open the blinds', '  ', 'Start the coffee']);
    const r = (await db.routines.where('type').equals('opening').first())!;
    expect(r.steps).toEqual([
      { text: 'Open the blinds', order: 0 },
      { text: 'Start the coffee', order: 1 },
    ]);
  });
});

describe('loadSuggestedTasks', () => {
  it('adds the starter plan once and fills empty routines', async () => {
    const n = await loadSuggestedTasks();
    expect(n).toBeGreaterThan(20);
    expect(await loadSuggestedTasks()).toBe(0);
    const opening = (await db.routines.where('type').equals('opening').first())!;
    expect(opening.steps.length).toBe(5);
  });

  it('does not touch routines that already have steps', async () => {
    await saveRoutineSteps('closing', ['Lock up']);
    await loadSuggestedTasks();
    const closing = (await db.routines.where('type').equals('closing').first())!;
    expect(closing.steps.map((s) => s.text)).toEqual(['Lock up']);
  });
});
