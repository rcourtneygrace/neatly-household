import { describe, expect, it } from 'vitest';
import {
  LAST_DAY,
  SEASON_PRESETS,
  defaultTiming,
  formatMonthDay,
  ordinal,
  presetFor,
  previewText,
  scheduleLabel,
  seasonOn,
  seasonRanges,
  seasonsInOrder,
  sortTasks,
  timingIsComplete,
} from './tasks';
import type { Task } from '../data/types';

const cal = SEASON_PRESETS.calendar;

describe('scheduleLabel (Plan rows, Figma wording)', () => {
  it.each([
    [{ cadence: 'daily', timingMode: 'every', timingValue: null }, 'Every day'],
    [{ cadence: 'weekly', timingMode: 'specific', timingValue: [3] }, 'Wednesdays'],
    [{ cadence: 'weekly', timingMode: 'every', timingValue: null }, 'Once every week'],
    [{ cadence: 'monthly', timingMode: 'every', timingValue: null }, 'Once every month'],
    [{ cadence: 'monthly', timingMode: 'specific', timingValue: 1 }, '1st of the month'],
    [{ cadence: 'monthly', timingMode: 'specific', timingValue: LAST_DAY }, 'Last day of the month'],
    [{ cadence: 'seasonal', timingMode: 'specific', timingValue: ['fall'] }, 'Every Fall'],
    [{ cadence: 'yearly', timingMode: 'every', timingValue: null }, 'Once every year'],
    [{ cadence: 'yearly', timingMode: 'specific', timingValue: 3 }, 'Every April'],
  ] as const)('%o → %s', (t, label) => expect(scheduleLabel(t as never)).toBe(label));
});

describe('previewText', () => {
  it('matches the Figma sentence for a weekly specific day', () => {
    expect(previewText({ cadence: 'weekly', timingMode: 'specific', timingValue: [3] })).toBe(
      'Shows up on Wednesday with a Heads up tag, since it is meant for that day. If missed, it moves to Priority until done.',
    );
  });
  it('matches the Figma sentence for a monthly first day', () => {
    expect(previewText({ cadence: 'monthly', timingMode: 'specific', timingValue: 1 })).toBe(
      'On the first day of every month, with a few days of runway.',
    );
  });
  it('never says overdue or skip', () => {
    for (const c of ['daily', 'weekly', 'monthly', 'seasonal', 'yearly'] as const) {
      for (const m of ['specific', 'every'] as const) {
        const t = defaultTiming(c, m, new Date(2026, 9, 15), cal);
        expect(previewText(t)).not.toMatch(/overdue|skip/i);
      }
    }
  });
});

describe('defaultTiming', () => {
  const oct15 = new Date(2026, 9, 15); // a Thursday in fall
  it('uses today for specific values', () => {
    expect(defaultTiming('weekly', 'specific', oct15, cal).timingValue).toEqual([4]);
    expect(defaultTiming('seasonal', 'specific', oct15, cal).timingValue).toEqual(['fall']);
    expect(defaultTiming('yearly', 'specific', oct15, cal).timingValue).toBe(9);
  });
  it('daily has no timing', () => {
    expect(defaultTiming('daily', 'specific', oct15, cal)).toEqual({ cadence: 'daily', timingMode: 'every', timingValue: null });
  });
});

describe('timingIsComplete', () => {
  it('needs a value for a specific timing', () => {
    expect(timingIsComplete({ cadence: 'weekly', timingMode: 'specific', timingValue: [] })).toBe(false);
    expect(timingIsComplete({ cadence: 'monthly', timingMode: 'specific', timingValue: LAST_DAY })).toBe(true);
    expect(timingIsComplete({ cadence: 'monthly', timingMode: 'every', timingValue: null })).toBe(true);
  });
});

describe('seasons', () => {
  it('finds the season for a date, including early January as winter', () => {
    expect(seasonOn(new Date(2026, 0, 5), cal)).toBe('winter');
    expect(seasonOn(new Date(2026, 2, 20), cal)).toBe('spring');
    expect(seasonOn(new Date(2026, 8, 21), cal)).toBe('summer');
    expect(seasonOn(new Date(2026, 8, 22), cal)).toBe('fall');
  });
  it('gives each season an end date the day before the next one', () => {
    const r = seasonRanges({ ...cal, fall: '09-15' });
    expect(r.map((x) => `${formatMonthDay(x.start)}–${formatMonthDay(x.end)}`)).toEqual([
      'Mar 20–Jun 20',
      'Jun 21–Sep 14',
      'Sep 15–Dec 20',
      'Dec 21–Mar 19',
    ]);
  });
  it('rejects seasons out of order', () => {
    expect(seasonsInOrder(cal)).toBe(true);
    expect(seasonsInOrder({ ...cal, summer: '02-01' })).toBe(false);
    expect(seasonsInOrder({ ...cal, fall: cal.summer })).toBe(false);
  });
  it('recognises the presets', () => {
    expect(presetFor(SEASON_PRESETS.weather)).toBe('weather');
    expect(presetFor({ ...cal, fall: '09-15' })).toBe('custom');
  });
});

describe('sortTasks', () => {
  it('orders by cadence, then name (Figma Kitchen group)', () => {
    const t = (name: string, cadence: Task['cadence']) => ({ name, cadence }) as Task;
    expect(
      sortTasks([t('Deep clean the oven', 'seasonal'), t('Dishwasher filter', 'monthly'), t('Wipe the counters', 'daily')]).map(
        (x) => x.name,
      ),
    ).toEqual(['Wipe the counters', 'Dishwasher filter', 'Deep clean the oven']);
  });
});

it('ordinal', () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal)).toEqual([
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '22nd',
    '28th',
  ]);
});
