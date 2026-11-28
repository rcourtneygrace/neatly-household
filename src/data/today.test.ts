import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ensureSeeded } from './seed';
import { saveTask } from './tasks';
import { cancelDayOff, completeClosing, completeOpening, endVacation, takeDayOff, planForToday, pushTo, reopenDay, setDone, skipItem, startVacation, undo } from './today';
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
    kind: 'offer',
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
    await setDone(item, true, '2026-10-15');
    expect((await occ('2026-10-11'))?.status).toBe('done');
    expect((await occ('2026-10-11'))?.completedAt).toBeTruthy();
    expect((await occ('2026-10-11'))?.completedOn).toBe('2026-10-15');
    expect((await occ('2026-10-04'))?.status).toBe('carriedOver');
    await setDone(item, false, '2026-10-15');
    expect((await occ('2026-10-11'))?.status).toBe('open');
    expect(await db.occurrences.count()).toBe(2); // updated in place, not duplicated
  });

  it('skip sets the instance (and the missed one) aside with a reason, and Undo restores it', async () => {
    await setDone(item, false, '2026-10-15');
    const snap = await skipItem(item, 'Weather');
    const o = await occ('2026-10-11');
    expect(o?.status).toBe('deferred');
    expect(o?.deferReason).toBe('Weather');
    expect((await occ('2026-10-04'))?.status).toBe('deferred');
    await undo(snap);
    expect((await occ('2026-10-11'))?.status).toBe('open');
    expect((await occ('2026-10-04'))?.status).toBe('open');
  });

  it('skip without a reason, and an Undo of a first-ever skip removes the row', async () => {
    const snap = await skipItem(item, null);
    expect((await occ('2026-10-11'))?.deferReason).toBeNull();
    await undo(snap);
    expect(await db.occurrences.count()).toBe(0);
  });

  it('push to a later date pins the task to that day', async () => {
    await pushTo(item, '2026-10-20');
    expect(await occ('2026-10-11')).toMatchObject({ plannedFor: '2026-10-20', pinned: true, status: 'open' });
  });

  it('vacation on and off', async () => {
    await startVacation('2026-10-01');
    await startVacation('2026-10-02'); // already on: no second period
    expect((await db.vacations.toArray()).map((v) => v.endDate)).toEqual([null]);
    await endVacation('2026-10-09');
    // the day it's turned off counts again
    expect((await db.vacations.toArray())[0]).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-08' });
  });

  it('a vacation can have a return date, and a planned one can be cancelled', async () => {
    await startVacation('2026-12-20', '2026-12-26');
    expect((await db.vacations.toArray())[0]).toMatchObject({ kind: 'vacation', startDate: '2026-12-20', endDate: '2026-12-26' });
    await endVacation('2026-12-10'); // before it starts: removed
    expect((await db.vacations.toArray()).filter((v) => !v.deletedAt)).toHaveLength(0);
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

  it('a day off is one day, ends by itself, and Back to work cancels it', async () => {
    await takeDayOff('2026-11-26', 'Thanksgiving');
    await takeDayOff('2026-11-26'); // already off: no second row
    const v = (await db.vacations.toArray()).filter((x) => !x.deletedAt);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'dayOff', startDate: '2026-11-26', endDate: '2026-11-26', label: 'Thanksgiving' });
    await cancelDayOff('2026-11-26', false);
    expect((await db.vacations.toArray()).filter((x) => !x.deletedAt)).toHaveLength(0);
  });

  it('working a yearly holiday is remembered for that date only', async () => {
    await cancelDayOff('2026-12-25', true);
    expect((await db.dayLogs.where('date').equals('2026-12-25').first())?.workday).toBe(true);
    await takeDayOff('2026-12-25');
    expect((await db.dayLogs.where('date').equals('2026-12-25').first())?.workday).toBe(false);
  });
});
