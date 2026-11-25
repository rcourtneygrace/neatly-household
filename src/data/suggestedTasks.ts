import { db, nowISO, stamp } from './db';
import type { Cadence, SeasonName, TimingMode, TimingValue } from './types';

/**
 * "Suggested tasks": a starter plan taken from the tasks shown in the Figma screens.
 * Adding them skips any task whose name is already on the plan, and fills Opening and
 * Closing only when they have no steps yet.
 */

type S = [name: string, department: string, cadence: Cadence, mode: TimingMode, value: TimingValue];

const WED = 3;
const SAT = 6;
const SUN = 0;
const fall: SeasonName[] = ['fall'];

const SUGGESTED: S[] = [
  ['Wipe the counters', 'Kitchen', 'daily', 'every', null],
  ['Water the plants', 'Living Spaces', 'daily', 'every', null],
  ['Clean the fridge', 'Kitchen', 'weekly', 'specific', [WED]],
  ['Wipe cupboard fronts', 'Kitchen', 'weekly', 'every', null],
  ['Vacuum under the beds', 'Bedrooms', 'weekly', 'specific', [WED]],
  ['Change the bed sheets', 'Bedrooms', 'weekly', 'every', null],
  ['Clean the bathrooms', 'Bathrooms', 'weekly', 'specific', [SAT]],
  ['Wash bed linens', 'Laundry', 'weekly', 'specific', [WED]],
  ['Wash the towels', 'Laundry', 'weekly', 'every', null],
  ['Mop the floors', 'Whole House', 'weekly', 'specific', [SUN]],
  ['Sweep the front walk', 'Grounds', 'weekly', 'every', null],
  ['Wash the pet bedding', 'Pet Care', 'weekly', 'every', null],
  ['Dishwasher filter', 'Kitchen', 'monthly', 'every', null],
  ['Clean the refrigerator coils', 'Kitchen', 'monthly', 'every', null],
  ['Descale the kettle', 'Kitchen', 'monthly', 'every', null],
  ['Wash the windows', 'Whole House', 'monthly', 'every', null],
  ['Test smoke detectors', 'Facilities', 'monthly', 'specific', 18],
  ['Clear out the desk', 'Home Office', 'monthly', 'every', null],
  ['Deep clean the oven', 'Kitchen', 'seasonal', 'specific', fall],
  ['Clean the gutters', 'Grounds', 'seasonal', 'specific', fall],
  ['Swap the seasonal wardrobe', 'Storage & Garage', 'seasonal', 'every', null],
  ['Flip the mattresses', 'Bedrooms', 'seasonal', 'every', null],
  ['Pressure wash the patio', 'Grounds', 'seasonal', 'every', null],
  ['Service the mower', 'Grounds', 'yearly', 'every', null],
  ['Declutter the garage', 'Storage & Garage', 'yearly', 'specific', 4],
  ['Service the HVAC', 'Facilities', 'yearly', 'specific', 8],
  ['Winterize the hose bibs', 'Grounds', 'yearly', 'specific', 10],
  ['Deep clean the carpets', 'Whole House', 'yearly', 'specific', 11],
  ['Sweep the chimney', 'Living Spaces', 'yearly', 'every', null],
];

const OPENING = ['Open the blinds', 'Start the coffee', 'Do the dishes', 'Check the pet water bowls', 'Take out the trash'];
const CLOSING = [
  'Wipe the counters',
  'Run the dishwasher',
  "Set out tomorrow's clothes",
  'Lock doors and windows',
  'Turn off the lights',
];

/** Returns how many tasks were added. */
export async function loadSuggestedTasks(): Promise<number> {
  return db.transaction('rw', db.tasks, db.departments, db.routines, async () => {
    const departments = await db.departments.toArray();
    const deptId = new Map(departments.map((d) => [d.name, d.id]));
    const existing = new Set(
      (await db.tasks.toArray()).filter((t) => !t.deletedAt).map((t) => t.name.toLowerCase()),
    );
    const rows = SUGGESTED.filter(([name, dept]) => !existing.has(name.toLowerCase()) && deptId.has(dept)).map(
      ([name, dept, cadence, timingMode, timingValue]) =>
        stamp({
          name,
          departmentId: deptId.get(dept)!,
          cadence,
          timingMode,
          timingValue,
          steps: [] as string[],
          notes: '',
          recordId: null,
          paused: false,
          archived: false,
        }),
    );
    await db.tasks.bulkAdd(rows);

    for (const [type, steps] of [
      ['opening', OPENING],
      ['closing', CLOSING],
    ] as const) {
      const r = await db.routines.where('type').equals(type).first();
      if (r && r.steps.length === 0) {
        await db.routines.update(r.id, { steps: steps.map((text, order) => ({ text, order })), updatedAt: nowISO() });
      }
    }
    return rows.length;
  });
}
