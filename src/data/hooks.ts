import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowISO } from './db';
import type { Household } from './types';

/** The single household row (one household, one phone in v1). */
export function useHousehold(): Household | undefined {
  return useLiveQuery(() => db.household.toCollection().first());
}

export async function updateHousehold(changes: Partial<Household>): Promise<void> {
  const h = await db.household.toCollection().first();
  if (!h) return;
  await db.household.update(h.id, { ...changes, updatedAt: nowISO() });
}
