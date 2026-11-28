import { describe, expect, it } from 'vitest';
import type { DayLog, Department, Occurrence, Task } from '../data/types';
import { SEASON_PRESETS } from './tasks';
import type { PlanCalendar } from './schedule';
import {
  balanceSuggestion,
  departmentStats,
  feelingOf,
  homeFocus,
  recentTaskStats,
  monthBalance,
  rhythm,
  scoreOf,
  slipOf,
  suggestionFor,
  taskStats,
  weekRhythm,
  type AnalysisInput,
} from './analysis';

const cal: PlanCalendar = { weekStart: 0, monthStart: 1, yearStart: 0, seasonStartDates: SEASON_PRESETS.calendar };
const T = '2026-10-15';
let n = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`,
  createdAt: '2026-01-01T12:00:00Z',
  updatedAt: '',
  name: `Task ${n}`,
  departmentId: 'grounds',
  cadence: 'weekly',
  timingMode: 'every',
  timingValue: null,
  steps: [],
  notes: '',
  paused: false,
  archived: false,
  activeSince: '2026-09-01',
  ...over,
});
const occ = (t: Task, key: string, over: Partial<Occurrence>): Occurrence => ({
  id: `o${++n}`,
  createdAt: '',
  updatedAt: '',
  taskId: t.id,
  periodStart: key,
  periodEnd: key,
  status: 'done',
  ...over,
});
const at = (day: string, h = 10) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, h).toISOString();
};
const input = (tasks: Task[], occurrences: Occurrence[], dayLogs: DayLog[] = []): AnalysisInput => ({
  today: T,
  tasks,
  occurrences,
  dayLogs,
  cal,
});
const dept: Department = { id: 'grounds', name: 'Grounds', order: 0, enabled: true, createdAt: '', updatedAt: '' };

describe('scores', () => {
  it('on time counts 1, late ½, missed 0; set aside is left out', () => {
    expect(scoreOf({ onTime: 2, late: 1, missed: 1, deferred: 5 })).toBe(63);
    expect(scoreOf({ onTime: 0, late: 0, missed: 0, deferred: 3 })).toBeNull();
  });
  it('labels', () => {
    expect([feelingOf(96), feelingOf(70), feelingOf(45), feelingOf(null)]).toEqual(['flowing', 'steady', 'reset', null]);
  });
});

describe('taskStats', () => {
  it('judges each finished week since the task started (Sep weeks of a weekly task)', () => {
    const t = task({ activeSince: '2026-09-06' });
    const weeks = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'];
    const occs = [
      occ(t, weeks[0], { completedAt: at('2026-09-08') }), // on time
      occ(t, weeks[1], { status: 'carriedOver' }), // late
      occ(t, weeks[2], { completedAt: at('2026-09-22') }),
      occ(t, weeks[3], { status: 'deferred', deferReason: 'Weather' }),
      // week of Oct 4 missed; week of Oct 11 is still open
    ];
    const [s] = taskStats(input([t], occs), '2026-09-01', '2026-10-31');
    expect(s.tally).toEqual({ onTime: 2, late: 1, missed: 1, deferred: 1 });
    expect(s.deferReasons).toEqual(['Weather']);
    expect(s.judged.at(-1)?.outcome).toBe('open');
  });

  it('daily tasks only count on days the household was opened', () => {
    const t = task({ cadence: 'daily', activeSince: '2026-10-01' });
    const logs = [{ date: '2026-10-05', openingStatus: 'done' } as DayLog];
    const [s] = taskStats(input([t], [], logs), '2026-10-01', '2026-10-31');
    expect(s.tally.missed).toBe(1);
  });
});

describe('department stats and home health', () => {
  it('rolls tasks up into a department ring and a calm sentence', () => {
    const t = task({});
    const occs = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'].map((w) =>
      occ(t, w, { status: 'deferred' }),
    );
    const missed = task({ name: 'Sweep' });
    const stats = taskStats(input([t, missed], occs), '2026-09-01', '2026-10-31');
    const [d] = departmentStats(stats, [dept]);
    expect(d.feeling).toBe('reset');
    const h = homeFocus([d]);
    expect(h.title).toBe('Your home could use a little attention');
    expect(h.focus.map((f) => f.department.name)).toEqual(['Grounds']);
  });

  it('says there is nothing to go on yet with no history', () => {
    expect(homeFocus(departmentStats([], [dept])).empty).toBe(true);
  });

  it('looks at each task over its own recent stretch', () => {
    const t = task({});
    const occs = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'].map((w) => occ(t, w, { status: 'done' }));
    const [s] = recentTaskStats({ ...input([t], occs), today: '2026-10-31' });
    // Eight weeks back from Oct 31 reaches Sep 5: the Sep 6 week counts, nothing before it
    expect(s.judged[0].inst.start >= '2026-09-05' || s.judged[0].inst.end >= '2026-09-05').toBe(true);
    expect(s.tally.onTime).toBe(5);
  });
});

describe('suggestions', () => {
  it('three set-asides in a row suggest a less frequent rhythm (Figma: Mop the floors)', () => {
    const t = task({ name: 'Mop the floors' });
    const occs = ['2026-09-20', '2026-09-27', '2026-10-04'].map((w) => occ(t, w, { status: 'deferred', deferReason: 'No time' }));
    const [s] = taskStats(input([t], occs), '2026-09-01', '2026-10-31');
    expect(suggestionFor(s)).toMatchObject({ kind: 'setAside', to: 'monthly', count: 3 });
    expect(slipOf(s)).toBe('setAside');
  });

  it('skips for life reasons, or with no reason, never suggest a change', () => {
    const t = task({});
    for (const reason of ["I'm sick", 'Bad weather', 'Something came up', null]) {
      const occs = ['2026-09-20', '2026-09-27', '2026-10-04'].map((w) => occ(t, w, { status: 'deferred', deferReason: reason }));
      const [s] = taskStats(input([t], occs), '2026-09-01', '2026-10-31');
      expect(suggestionFor(s)).toBeNull();
    }
  });

  it('vacation days are left out of every number', () => {
    const t = task({ activeSince: '2026-09-06' });
    const away = [{ startDate: '2026-09-06', endDate: '2026-10-10' }];
    const [s] = taskStats({ ...input([t], []), vacations: away }, '2026-09-01', '2026-10-31');
    expect(s.tally).toEqual({ onTime: 0, late: 0, missed: 0, deferred: 0 });
  });

  it('no suggestion without a clear pattern', () => {
    const t = task({ activeSince: '2026-09-06' });
    const occs = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'].map((w) =>
      occ(t, w, { completedAt: at(w) }),
    );
    const [s] = taskStats(input([t], occs), '2026-09-01', '2026-10-31');
    expect(suggestionFor(s)).toBeNull();
    expect(slipOf(s)).toBeNull();
  });
});

describe('rhythm', () => {
  it('counts completions by hour and weekday', () => {
    const t = task({});
    const occs = [
      occ(t, 'a', { completedAt: at('2026-10-10', 9) }), // Saturday
      occ(t, 'b', { completedAt: at('2026-10-10', 10) }),
      occ(t, 'c', { completedAt: at('2026-10-10', 10) }),
      occ(t, 'd', { completedAt: at('2026-10-12', 19) }), // Monday
    ];
    const r = rhythm(input([t], occs), '2026-10-01', '2026-10-31');
    expect(r.total).toBe(4);
    expect(r.hours[10 - 6]).toBe(2);
    expect(r.week).toEqual([1, 0, 0, 0, 0, 3, 0]);
    expect(weekRhythm(r).busiest).toBe(6);
  });
});

describe('monthly balance (Figma Adjust monthly tasks)', () => {
  const m = (name: string, day: number) => task({ name, cadence: 'monthly', timingMode: 'specific', timingValue: day });
  const tasks = [
    m('Dishwasher filter', 1),
    m('Change the HVAC filter', 1),
    m('Clean the refrigerator coils', 2),
    m('Wash the windows', 3),
    m('Descale the kettle', 10),
    m('Test smoke detectors', 15),
    m('Clean the garbage disposal', 24),
  ];
  it('labels the weeks', () => {
    expect(monthBalance(tasks)).toEqual({ counts: [4, 1, 1, 1], labels: ['Fullest', 'Light', 'Light', 'Light'] });
  });
  it('suggests moving the two latest week-one tasks into a light week', () => {
    const s = balanceSuggestion(tasks)!;
    expect(s.from).toBe(0);
    expect(s.moves.map((x) => `${x.task.name} ${x.fromDay}→${x.toDay}`)).toEqual([
      'Clean the refrigerator coils 2→15',
      'Wash the windows 3→16',
    ]);
  });
  it('does not suggest again once the month is roughly even', () => {
    const after = tasks.map((t) =>
      t.name === 'Clean the refrigerator coils' ? { ...t, timingValue: 15 } : t.name === 'Wash the windows' ? { ...t, timingValue: 16 } : t,
    );
    expect(balanceSuggestion(after)).toBeNull();
  });
});
