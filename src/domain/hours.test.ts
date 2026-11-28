import { describe, expect, it } from 'vitest';
import { closingTime, householdDay, minutesIntoDay } from './hours';

const h = { weekdayOpen: '07:00', weekdayClose: '21:00', weekendOpen: '08:00', weekendClose: '22:00' };
// 2026-11-27 is a Friday, 2026-11-28 a Saturday
const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

describe('household day', () => {
  it('runs from opening to the next opening', () => {
    expect(householdDay(at('2026-11-26', '07:00'), h)).toBe('2026-11-26');
    expect(householdDay(at('2026-11-26', '23:59'), h)).toBe('2026-11-26');
    expect(householdDay(at('2026-11-27', '00:30'), h)).toBe('2026-11-26');
    expect(householdDay(at('2026-11-27', '06:59'), h)).toBe('2026-11-26');
    expect(householdDay(at('2026-11-27', '07:00'), h)).toBe('2026-11-27');
  });

  it('uses the weekend opening on weekend mornings', () => {
    expect(householdDay(at('2026-11-28', '07:30'), h)).toBe('2026-11-27'); // Saturday opens at 8
    expect(householdDay(at('2026-11-28', '08:00'), h)).toBe('2026-11-28');
  });

  it('can be started early', () => {
    expect(householdDay(at('2026-11-27', '05:45'), h, true)).toBe('2026-11-27');
  });

  it('Closing shows an hour before close and stays until the next opening', () => {
    expect(closingTime(at('2026-11-26', '19:59'), '2026-11-26', h)).toBe(false);
    expect(closingTime(at('2026-11-26', '20:00'), '2026-11-26', h)).toBe(true);
    expect(closingTime(at('2026-11-27', '00:30'), '2026-11-26', h)).toBe(true);
    // Friday night uses Friday (weekday) hours even after midnight
    expect(minutesIntoDay(at('2026-11-28', '01:00'), '2026-11-27', h)).toBe(18 * 60);
  });

  it('handles a close time past midnight', () => {
    const late = { ...h, weekdayClose: '01:00' };
    expect(closingTime(at('2026-11-26', '23:30'), '2026-11-26', late)).toBe(false);
    expect(closingTime(at('2026-11-27', '00:00'), '2026-11-26', late)).toBe(true);
  });
});
