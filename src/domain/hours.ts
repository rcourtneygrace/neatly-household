/**
 * The household day. It runs from that day's opening time (Settings → Business hours) to the
 * next day's opening time, not midnight to midnight. At 12:30 a.m. you are still finishing the
 * evening before: its Closing is still there, and anything checked off counts for it.
 */
import type { BusinessHours } from '../data/types';
import { addDays, minutesOf, toDay, weekdayOf, type Day } from './dates';

/** Closing shows this long before the close time. */
export const CLOSING_LEAD_MINUTES = 60;

export function hoursOn(day: Day, h: BusinessHours): { open: string; close: string } {
  const weekend = [0, 6].includes(weekdayOf(day));
  return weekend ? { open: h.weekendOpen, close: h.weekendClose } : { open: h.weekdayOpen, close: h.weekdayClose };
}

/**
 * Which household day `now` belongs to. Before the calendar day's opening time it is still the
 * day before, unless today was started early ("Open early").
 */
export function householdDay(now: Date, h: BusinessHours, startedEarly = false): Day {
  const cal = toDay(now);
  if (startedEarly || minutesOf(now) >= minutesOf(hoursOn(cal, h).open)) return cal;
  return addDays(cal, -1);
}

/** Minutes since household day `day` opened (passes 1440 after midnight). */
export function minutesIntoDay(now: Date, day: Day, h: BusinessHours): number {
  const sinceMidnight = minutesOf(now) + (toDay(now) > day ? 1440 : 0);
  return sinceMidnight - minutesOf(hoursOn(day, h).open);
}

/** When Closing appears, in minutes since the day opened. A close time past midnight is allowed. */
export function closingStartsAt(day: Day, h: BusinessHours): number {
  const { open, close } = hoursOn(day, h);
  let length = minutesOf(close) - minutesOf(open);
  if (length <= 0) length += 1440;
  return Math.max(0, length - CLOSING_LEAD_MINUTES);
}

/** Closing is showing: from an hour before close until the next opening. */
export function closingTime(now: Date, day: Day, h: BusinessHours): boolean {
  return minutesIntoDay(now, day, h) >= closingStartsAt(day, h);
}

/** The household day an ISO time falls in (for completions). Early starts are not known here. */
export function householdDayOf(iso: string, h: BusinessHours): Day {
  return householdDay(new Date(iso), h);
}
