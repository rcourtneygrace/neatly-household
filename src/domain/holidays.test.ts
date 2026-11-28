import { describe, expect, it } from 'vitest';
import { HOLIDAYS, dayOffMessage, holidayOn, offDaySpans, ownHoliday, yearlyHolidays } from './holidays';
import { buildToday, dayOffOn, nextWorkday, windowEnd } from './schedule';
import { judge } from './analysis';
import type { Occurrence, Task } from '../data/types';

const on = (id: string, y: number) => HOLIDAYS.find((h) => h.id === id)!.on(y);

describe('holidays', () => {
  it('finds the right dates', () => {
    expect(on('thanksgiving', 2026)).toBe('2026-11-26');
    expect(on('thanksgiving', 2027)).toBe('2027-11-25');
    expect(on('memorialDay', 2026)).toBe('2026-05-25');
    expect(on('laborDay', 2026)).toBe('2026-09-07');
    expect(on('easter', 2026)).toBe('2026-04-05');
    expect(on('easter', 2027)).toBe('2027-03-28');
    expect(on('mothersDay', 2026)).toBe('2026-05-10');
  });

  it('builds day-off spans, leaving out holidays someone chose to work', () => {
    const spans = offDaySpans({ today: '2026-11-27', vacations: [], holidays: HOLIDAYS.filter((h) => ['thanksgiving', 'christmas'].includes(h.id)), workdays: new Set(['2026-12-25']) });
    expect(dayOffOn('2026-11-26', spans)?.label).toBe('Thanksgiving');
    expect(dayOffOn('2026-12-25', spans)).toBeUndefined();
    expect(nextWorkday('2026-11-26', spans)).toBe('2026-11-27');
  });

  it("includes the household's own yearly days", () => {
    const list = yearlyHolidays({ holidays: ['christmas'], yearlyDays: [{ id: 'a', name: "Mia's birthday", month: 2, day: 14 }] });
    expect(holidayOn('2027-03-14', list)?.name).toBe("Mia's birthday");
    expect(holidayOn('2026-12-25', list)?.name).toBe('Christmas Day');
    expect(ownHoliday({ id: 'b', name: 'Leap', month: 1, day: 29 }).on(2027)).toBe('2027-02-28');
  });

  it('says what kind of day off it is', () => {
    expect(dayOffMessage('My birthday', true)).toBe('Today is your birthday, enjoy your day off.');
    expect(dayOffMessage("Mia's birthday", true)).toBe("Today is Mia's birthday, enjoy your day off.");
    expect(dayOffMessage('Sick day', false)).toBe('Rest up and feel better.');
    expect(dayOffMessage(null, false)).toBe('Enjoy your day off.');
    expect(dayOffMessage('Whiskey party', false)).toBe('Whiskey party · Enjoy your day off.');
  });
});

const cal = { weekStart: 0, monthStart: 1, yearStart: 0, seasonStartDates: { spring: '03-20', summer: '06-21', fall: '09-22', winter: '12-21' } };
const task: Task = {
  id: 't', name: 'Trash night', departmentId: 'd', notes: '', paused: false, archived: false, cadence: 'weekly',
  timingMode: 'on', timingValue: [4], activeSince: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', updatedAt: '', deletedAt: null,
} as unknown as Task;
const off = [{ startDate: '2026-11-26', endDate: '2026-11-26', kind: 'dayOff' as const, label: 'Thanksgiving' }];
const view = (today: string, occurrences: Occurrence[] = []) =>
  buildToday({ today, tasks: [task], occurrences, cal, clearWhenChecked: false, openedDays: new Set(), vacations: off });

describe('a task due on a day off', () => {
  it('moves to the next day as a normal task, not Priority', () => {
    const row = view('2026-11-27').inProgress[0];
    expect(row).toMatchObject({ kind: 'locked', priority: false, tag: 'today' });
    expect(row.inst.due).toBe('2026-11-26');
  });

  it('becomes Priority only after the day it moved to', () => {
    const offer = view('2026-11-28').offers[0];
    expect(offer?.priority).toBe(true);
  });

  it('counts as on time when done the day after', () => {
    const inst = { key: '2026-11-26', start: '2026-11-22', end: '2026-11-26', due: '2026-11-26' };
    expect(windowEnd(inst, off)).toBe('2026-11-27');
    const occ = { status: 'done', completedAt: '2026-11-27T15:00:00Z', completedOn: '2026-11-27' } as Occurrence;
    expect(judge(task, inst, occ, '2026-11-30', new Set(), off)).toBe('onTime');
    expect(judge(task, inst, undefined, '2026-11-27', new Set(), off)).toBe('open');
    expect(judge(task, inst, undefined, '2026-11-30', new Set(), off)).toBe('missed');
  });

  it('daily tasks are not Priority the day after a day off', () => {
    const daily = { ...task, id: 'd1', cadence: 'daily', timingMode: 'every', timingValue: null } as unknown as Task;
    const v = buildToday({ today: '2026-11-27', tasks: [daily], occurrences: [], cal, clearWhenChecked: false, openedDays: new Set(['2026-11-26']), vacations: off });
    expect(v.daily[0].priority).toBe(false);
  });
});
