import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ensureSeeded } from './seed';
import { saveTask } from './tasks';
import { completeClosing, completeOpening, deferItem, planForToday, reopenDay, setDone } from './today';
import type { TodayItem } from '../domain/schedule';

let item: TodayItem;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded();
  const dept = (await db.departments.toCollection().first())!.id;
  const id = await saveTask({
    name: 'Wash the towels',
    departmentId: dept,
    notes: '',
    paused: false,
    cadence: 'weekly',
    timingMode: 'every',
    timingValue: null,
  });
  const task = (await db.tasks.get(id))!;
  item = {
    task,
    inst: { key: '2026-10-11', start: '2026-10-11', end: '2026-10-17', due: null },
    tag: 'priority',
    done: false,
    planned: false,
    priority: true,
    carriedFrom: { key: '2026-10-04', start: '2026-10-04', end: '2026-10-10', due: null },
  };
});

const occ = (key: string) => db.occurrences.where('[taskId+periodStart]').equals([item.task.id, key]).first();

describe('Today actions', () => {
  it('checking off a carried-over row records both instances, and un-checking reverts', async () => {
    await setDone(item, true);
    expect((await occ('2026-10-11'))?.status).toBe('done');
    expect((await occ('2026-10-11'))?.completedAt).toBeTruthy();
    expect((await occ('2026-10-04'))?.status).toBe('carriedOver');
    await setDone(item, false);
    expect((await occ('2026-10-11'))?.status).toBe('open');
    expect(await db.occurrences.count()).toBe(2); // updated in place, not duplicated
  });

  it('defer sets the instance (and the missed one) aside with a reason', async () => {
    await deferItem(item, 'Weather');
    const o = await occ('2026-10-11');
    expect(o?.status).toBe('deferred');
    expect(o?.deferReason).toBe('Weather');
    expect((await occ('2026-10-04'))?.status).toBe('deferred');
  });

  it('Build Your Day marks picks for today without changing their status', async () => {
    await planForToday([item], '2026-10-15');
    const o = await occ('2026-10-11');
    expect(o?.plannedFor).toBe('2026-10-15');
    expect(o?.status).toBe('open');
  });

  it('opening and closing are logged once per day, and the day can be reopened', async () => {
    await completeOpening('2026-10-15');
    await completeClosing('2026-10-15', { planned: 5, completed: 3 });
    const logs = await db.dayLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ openingStatus: 'done', closingStatus: 'done', tasksPlanned: 5, tasksCompleted: 3 });
    await reopenDay('2026-10-15');
    expect((await db.dayLogs.toArray())[0].closingStatus).toBe('open');
  });
});
