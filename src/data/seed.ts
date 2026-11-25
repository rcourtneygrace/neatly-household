import { db, stamp } from './db';
import type { Household } from './types';

/** The twelve fixed departments from the Figma Analysis screen. */
export const DEPARTMENTS = [
  'Kitchen',
  'Living Spaces',
  'Bedrooms',
  'Bathrooms',
  'Laundry',
  'Entry & Mudroom',
  'Storage & Garage',
  'Home Office',
  'Facilities',
  'Grounds',
  'Pet Care',
  'Whole House',
];

export function defaultHousehold(): Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    name: 'My Household',
    mission: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekStart: 0,
    monthStart: 1,
    yearStart: 0,
    seasonPreset: 'calendar',
    seasonStartDates: { spring: '03-20', summer: '06-21', fall: '09-22', winter: '12-21' },
    clearWhenChecked: false,
    accent: 'teal',
    unlocked: false,
    businessHours: {
      weekdayOpen: '07:00',
      weekdayClose: '21:00',
      weekendOpen: '08:00',
      weekendClose: '21:00',
    },
  };
}

/**
 * First-run setup until the real setup flow exists (waiting on product spec v1):
 * a default household, the 12 departments and empty Opening/Closing routines.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.household, db.departments, db.routines, async () => {
    if ((await db.household.count()) === 0) {
      await db.household.add(stamp(defaultHousehold()));
    }
    if ((await db.departments.count()) === 0) {
      await db.departments.bulkAdd(DEPARTMENTS.map((name, order) => stamp({ name, order, enabled: true })));
    }
    if ((await db.routines.count()) === 0) {
      await db.routines.bulkAdd([
        stamp({ type: 'opening' as const, steps: [] }),
        stamp({ type: 'closing' as const, steps: [] }),
      ]);
    }
  });
}
