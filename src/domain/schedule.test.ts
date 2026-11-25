import { describe, expect, it } from 'vitest';
import type { Occurrence, Task } from '../data/types';
import { SEASON_PRESETS } from './tasks';
import { buildToday, instancesAround, periodFor, rowMeta, type PlanCalendar, type TodayInput } from './schedule';

const cal: PlanCalendar = { weekStart: 0, monthStart: 1, yearStart: 0, seasonStartDates: SEASON_PRESETS.calendar };
const T = '2026-10-15'; // Thursday, as in the Figma Today screens
const LONG_AGO = '2026-01-01';

let n = 0;
function task(over: Partial<Task>): Task {
  return {
    id: `t${++n}`,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '',
    name: over.name ?? `Task ${n}`,
    departmentId: 'kitchen',
    cadence: 'weekly',
    timingMode: 'every',
    timingValue: null,
    steps: [],
    notes: '',
    paused: false,
    archived: false,
    activeSince: '2026-10-12', // added this week: no history to carry over
    ...over,
  };
}
function occ(t: Task, periodStart: string, over: Partial<Occurrence> = {}): Occurrence {
  return { id: `o${++n}`, createdAt: '', updatedAt: '', taskId: t.id, periodStart, periodEnd: periodStart, status: 'done', ...over };
}
const view = (tasks: Task[], occurrences: Occurrence[] = [], over: Partial<TodayInput> = {}) =>
  buildToday({ today: T, tasks, occurrences, cal, clearWhenChecked: false, openedDays: new Set(), ...over });

describe('periodFor', () => {
  it('weeks follow the week start', () => {
    expect(periodFor('weekly', T, cal)).toEqual({ start: '2026-10-11', end: '2026-10-17' });
    expect(periodFor('weekly', T, { ...cal, weekStart: 1 })).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('months follow the month start day', () => {
    expect(periodFor('monthly', T, cal)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodFor('monthly', T, { ...cal, monthStart: 20 })).toEqual({ start: '2026-09-20', end: '2026-10-19' });
  });
  it('seasons use the season dates, winter crossing new year', () => {
    expect(periodFor('seasonal', T, cal)).toEqual({ start: '2026-09-22', end: '2026-12-20' });
    expect(periodFor('seasonal', '2026-01-10', cal)).toEqual({ start: '2025-12-21', end: '2026-03-19' });
  });
  it('years follow the year start month', () => {
    expect(periodFor('yearly', T, cal)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodFor('yearly', '2026-03-01', { ...cal, yearStart: 8 })).toEqual({ start: '2025-09-01', end: '2026-08-31' });
  });
});

describe('instancesAround', () => {
  it('a monthly "last day" task uses each month\'s real last day', () => {
    const t = task({ cadence: 'monthly', timingMode: 'specific', timingValue: -1 });
    expect(instancesAround(t, '2026-02-10', cal).map((i) => i.due)).toContain('2026-02-28');
  });
});

describe('buildToday tags (Figma Today, Oct 15)', () => {
  it('Heads up two days before a set day, quiet before that, Today on the day', () => {
    const kettle = task({ name: 'Descale the kettle', cadence: 'monthly', timingMode: 'specific', timingValue: 17 });
    const filter = task({ name: 'Dishwasher filter', cadence: 'monthly', timingMode: 'specific', timingValue: 15 });
    const quiet = task({ name: 'Wipe vents', cadence: 'monthly', timingMode: 'specific', timingValue: 19 });
    const later = task({ name: 'Not yet', cadence: 'monthly', timingMode: 'specific', timingValue: 25 });
    const v = view([kettle, filter, quiet, later]);
    const tag = (name: string) => v.inProgress.find((i) => i.task.name === name)?.tag;
    expect(tag('Descale the kettle')).toBe('headsUp');
    expect(tag('Dishwasher filter')).toBe('today');
    expect(tag('Wipe vents')).toBeNull();
    expect(v.inProgress.find((i) => i.task.name === 'Not yet')).toBeUndefined();
  });

  it('a missed set day is carried over as Priority, with its date', () => {
    const patio = task({
      name: 'Put away the patio furniture',
      timingMode: 'specific',
      timingValue: [6],
      activeSince: LONG_AGO,
    });
    const v = view([patio]);
    const row = v.inProgress[0];
    expect(v.inProgress).toHaveLength(1); // one row, not one per Saturday
    expect(row.tag).toBe('priority');
    expect(row.carriedFrom?.due).toBe('2026-10-10');
    expect(rowMeta(row, 'Grounds', T)).toEqual({ text: 'Grounds · Saturdays · Oct 10', clay: true });
  });

  it('a done or set-aside instance is not carried over', () => {
    const patio = task({ timingMode: 'specific', timingValue: [6], activeSince: LONG_AGO });
    expect(view([patio], [occ(patio, '2026-10-10')]).inProgress[0].tag).toBe('headsUp');
    expect(view([patio], [occ(patio, '2026-10-10', { status: 'deferred' })]).inProgress[0].tag).toBe('headsUp');
  });

  it('nothing from before the task was added is carried over', () => {
    const patio = task({ timingMode: 'specific', timingValue: [6], activeSince: '2026-10-12' });
    expect(view([patio]).inProgress[0].priority).toBe(false);
  });

  it('"every week" tasks show untagged all week, and Priority when last week was missed', () => {
    const towels = task({ name: 'Wash the towels', activeSince: LONG_AGO });
    const lastWeekDone = view([towels], [occ(towels, '2026-10-04')]);
    expect(lastWeekDone.inProgress[0].tag).toBeNull();
    expect(view([towels]).inProgress[0].tag).toBe('priority');
  });

  it('checked rows stay crossed out today, and leave the list when "clear when checked" is on', () => {
    const towels = task({ name: 'Wash the towels' });
    const done = occ(towels, '2026-10-11', { completedAt: new Date(2026, 9, 15, 9).toISOString() });
    const prev = occ(towels, '2026-10-04');
    expect(view([towels], [done, prev]).inProgress[0].done).toBe(true);
    expect(view([towels], [done, prev], { clearWhenChecked: true }).inProgress).toHaveLength(0);
  });

  it('a task finished earlier in its period is hidden', () => {
    const towels = task({});
    const done = occ(towels, '2026-10-11', { completedAt: new Date(2026, 9, 12, 9).toISOString() });
    expect(view([towels], [done]).inProgress).toHaveLength(0);
  });

  it('picked in Build Your Day gets the Today tag', () => {
    const towels = task({});
    const v = view([towels], [occ(towels, '2026-10-04'), occ(towels, '2026-10-11', { status: 'open', plannedFor: T })]);
    expect(v.inProgress[0].tag).toBe('today');
  });

  it('paused tasks do not show', () => {
    expect(view([task({ paused: true })]).inProgress).toHaveLength(0);
  });

  it('orders Priority first, then Today, Heads up, then the rest', () => {
    const a = task({ name: 'A untagged', cadence: 'seasonal', timingMode: 'specific', timingValue: ['fall'] });
    const b = task({ name: 'B heads up', cadence: 'monthly', timingMode: 'specific', timingValue: 17 });
    const c = task({ name: 'C priority', timingMode: 'specific', timingValue: [6], activeSince: LONG_AGO });
    const d = task({ name: 'D today', cadence: 'monthly', timingMode: 'specific', timingValue: 15 });
    expect(view([a, b, c, d]).inProgress.map((i) => i.task.name)).toEqual(['C priority', 'D today', 'B heads up', 'A untagged']);
  });
});

describe('daily tasks', () => {
  it('roll over as Priority only after a day the household was opened', () => {
    const wipe = task({ cadence: 'daily', activeSince: LONG_AGO });
    expect(view([wipe]).daily[0].priority).toBe(false);
    expect(view([wipe], [], { openedDays: new Set(['2026-10-14']) }).daily[0].priority).toBe(true);
    expect(view([wipe], [occ(wipe, '2026-10-14')], { openedDays: new Set(['2026-10-14']) }).daily[0].priority).toBe(false);
  });
});

describe('Coming Soon', () => {
  it('groups next month and later this year (Figma)', () => {
    const hose = task({ name: 'Winterize the hose bibs', cadence: 'yearly', timingMode: 'specific', timingValue: 10 });
    const carpets = task({ name: 'Deep clean the carpets', cadence: 'yearly', timingMode: 'specific', timingValue: 11 });
    const smoke = task({ name: 'Test smoke detectors', cadence: 'monthly' });
    const smokeDone = occ(smoke, '2026-10-01', { completedAt: new Date(2026, 9, 3).toISOString() });
    const v = view([hose, carpets, smoke], [smokeDone, occ(smoke, '2026-09-01')]);
    expect(v.comingSoon.map((g) => [g.label, g.items.map((i) => `${i.task.name} ${i.pill}`)])).toEqual([
      ['Next month · November', ['Test smoke detectors Nov', 'Winterize the hose bibs Nov']],
      ['Later this year', ['Deep clean the carpets Dec']],
    ]);
  });
});
