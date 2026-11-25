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

describe('Today\'s list and Build Your Day offers (Oct 15)', () => {
  const names = (items: { task: Task }[]) => items.map((i) => i.task.name);

  it('a set day that is today is locked on today; nearby set days are offered with Heads up; far ones wait', () => {
    const kettle = task({ name: 'Descale the kettle', cadence: 'monthly', timingMode: 'specific', timingValue: 17 });
    const filter = task({ name: 'Dishwasher filter', cadence: 'monthly', timingMode: 'specific', timingValue: 15 });
    const four = task({ name: 'Wipe vents', cadence: 'monthly', timingMode: 'specific', timingValue: 19 });
    const far = task({ name: 'Not yet', cadence: 'monthly', timingMode: 'specific', timingValue: 25 });
    const v = view([kettle, filter, four, far]);
    expect(v.inProgress.map((i) => [i.task.name, i.kind, i.tag])).toEqual([['Dishwasher filter', 'locked', 'today']]);
    expect(v.offers.map((i) => [i.task.name, i.tag])).toEqual([
      ['Descale the kettle', 'headsUp'],
      ['Wipe vents', null], // monthly: offered up to 4 days ahead
    ]);
    expect(names(v.comingSoon.flatMap((g) => g.items))).toContain('Not yet');
  });

  it('weekly set days are offered only up to 2 days ahead', () => {
    const sat = task({ name: 'Saturday job', timingMode: 'specific', timingValue: [6] }); // Oct 17, 2 days
    const sun = task({ name: 'Sunday job', timingMode: 'specific', timingValue: [0] }); // Oct 18, 3 days
    expect(names(view([sat, sun]).offers)).toEqual(['Saturday job']);
  });

  it('unpicked tasks stay off Today and are offered; a missed window is offered as Priority with its date', () => {
    const towels = task({ name: 'Wash the towels' });
    const patio = task({ name: 'Put away the patio furniture', timingMode: 'specific', timingValue: [6], activeSince: LONG_AGO });
    const v = view([towels, patio]);
    expect(v.inProgress).toHaveLength(0);
    expect(names(v.offers)).toEqual(['Put away the patio furniture', 'Wash the towels']);
    const p = v.offers[0];
    expect(p.tag).toBe('priority');
    expect(p.carriedFrom?.due).toBe('2026-10-10');
    expect(rowMeta(p, 'Grounds', T)).toEqual({ text: 'Grounds · Saturdays · Oct 10', clay: true });
  });

  it('a done or skipped window is not carried over, and nothing from before the task was added', () => {
    const towels = task({ activeSince: LONG_AGO });
    expect(view([towels], [occ(towels, '2026-10-04')]).offers[0].priority).toBe(false);
    expect(view([towels], [occ(towels, '2026-10-04', { status: 'deferred' })]).offers[0].priority).toBe(false);
    expect(view([task({})]).offers[0].priority).toBe(false);
  });

  it('a pick is on Today with the Today tag, and an unfinished pick carries over the next day', () => {
    const towels = task({});
    const picked = view([towels], [occ(towels, '2026-10-11', { status: 'open', plannedFor: T })]);
    expect(picked.inProgress.map((i) => [i.kind, i.tag])).toEqual([['picked', 'today']]);
    expect(picked.offers).toHaveLength(0);
    const nextDay = view([towels], [occ(towels, '2026-10-11', { status: 'open', plannedFor: '2026-10-14' })]);
    expect(nextDay.inProgress[0].carriedPick).toBe(true);
    expect(nextDay.inProgress[0].priority).toBe(false);
    expect(rowMeta(nextDay.inProgress[0], 'Laundry', T).emphasis).toBe('Carried over');
  });

  it('push to a later date: off Today until that day, then locked', () => {
    const towels = task({});
    const pushed = [occ(towels, '2026-10-11', { status: 'open', plannedFor: '2026-10-17', pinned: true })];
    const now = view([towels], pushed);
    expect(now.inProgress).toHaveLength(0);
    expect(now.offers).toHaveLength(0);
    const then = view([towels], pushed, { today: '2026-10-17' });
    expect(then.inProgress.map((i) => i.kind)).toEqual(['locked']);
  });

  it('checked rows stay crossed out today, and leave the list when "clear when checked" is on', () => {
    const towels = task({});
    const done = occ(towels, '2026-10-11', { completedAt: new Date(2026, 9, 15, 9).toISOString(), plannedFor: T });
    expect(view([towels], [done]).inProgress[0].done).toBe(true);
    expect(view([towels], [done], { clearWhenChecked: true }).inProgress).toHaveLength(0);
  });

  it('a task finished earlier in its period is neither on Today nor offered', () => {
    const towels = task({});
    const done = occ(towels, '2026-10-11', { completedAt: new Date(2026, 9, 12, 9).toISOString() });
    const v = view([towels], [done]);
    expect(v.inProgress).toHaveLength(0);
    expect(v.offers).toHaveLength(0);
  });

  it('paused tasks do not show anywhere', () => {
    const v = view([task({ paused: true })]);
    expect(v.inProgress.length + v.offers.length).toBe(0);
  });
});

describe('vacation mode', () => {
  const away = [{ startDate: '2026-10-03', endDate: '2026-10-12' }];
  it('windows that ended during the trip are not Priority after it', () => {
    const patio = task({ timingMode: 'specific', timingValue: [6], activeSince: LONG_AGO }); // Oct 10 in the trip
    expect(view([patio]).offers[0].priority).toBe(true);
    expect(view([patio], [], { vacations: away }).offers[0].priority).toBe(false);
  });
  it('a pick from before the trip is not carried over after it', () => {
    const towels = task({});
    const pick = occ(towels, '2026-09-27', { status: 'open', plannedFor: '2026-10-02', periodEnd: '2026-10-03' });
    expect(view([towels], [pick], { vacations: away }).inProgress).toHaveLength(0);
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
