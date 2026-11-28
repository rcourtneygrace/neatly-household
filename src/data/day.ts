import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { householdDay } from '../domain/hours';
import { toDay, type Day } from '../domain/dates';

async function dayAt(now: Date): Promise<Day | undefined> {
  const household = await db.household.toCollection().first();
  if (!household) return undefined;
  const log = await db.dayLogs.where('date').equals(toDay(now)).first();
  return householdDay(now, household.businessHours, !!log?.startedEarly);
}

/** Today's household day (opening to opening), kept live as the time, hours or an early start change. */
export function useHouseholdDay(now: Date): Day | undefined {
  const minute = Math.floor(now.getTime() / 60_000);
  return useLiveQuery(() => dayAt(now), [minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The household day right now, for actions outside a screen. */
export async function currentHouseholdDay(): Promise<Day> {
  const now = new Date();
  return (await dayAt(now)) ?? toDay(now);
}
