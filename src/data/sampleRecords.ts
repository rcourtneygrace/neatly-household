/** Sample records from the Figma "Records tab" screen, for trying the app with realistic content. */
import { db, stamp } from './db';
import type { RecordCategory, RecordEntry } from './types';

type Sample = Pick<RecordEntry, 'title' | 'category' | 'details' | 'links' | 'notes'>;

const d = (label: string, value: string) => ({ label, value });

const SAMPLES: Sample[] = [
  { title: 'Kitchen cabinets', category: 'Paint & Finishes', details: [d('Brand', 'Benjamin Moore'), d('Color', 'Hale Navy'), d('Finish', 'Satin')], links: [], notes: '' },
  { title: 'Living Spaces walls', category: 'Paint & Finishes', details: [d('Brand', 'Sherwin-Williams'), d('Color', 'Alabaster'), d('Finish', 'Eggshell')], links: [], notes: '' },
  { title: 'Dishwasher filter', category: 'Products & Supplies', details: [d('Brand', 'Bosch')], links: [{ label: 'Buy on Amazon', url: 'https://www.amazon.com/' }], notes: '' },
  { title: 'Front door handle', category: 'Products & Supplies', details: [d('Finish', 'Satin nickel lever')], links: [], notes: '' },
  {
    title: 'Fridge water filter',
    category: 'Products & Supplies',
    details: [d('Brand', 'Samsung'), d('Model', 'HAF-CIN'), d('Replace', 'Every 6 months'), d('Where to buy', 'Amazon')],
    links: [{ label: 'Buy on Amazon', url: 'https://www.amazon.com/' }],
    notes: 'Twist the old one out, then push the new one in until it clicks. Hold the filter button for 3 seconds to reset the light.',
  },
  { title: 'Air filter', category: 'Home Sizes & Measurements', details: [d('Size', '16 × 25 × 1 in')], links: [], notes: '' },
  { title: 'Window sizes', category: 'Home Sizes & Measurements', details: [d('Size', '36 × 60 in')], links: [], notes: '' },
  { title: 'Electrician', category: 'Home Contacts', details: [d('Company', 'Brightline Electric'), d('Phone', '(555) 010-0164')], links: [], notes: '' },
  { title: 'Plumber', category: 'Home Contacts', details: [d('Company', 'Rivera Plumbing'), d('Phone', '(555) 010-0188')], links: [], notes: '' },
  { title: 'Dentist', category: 'Doctors & Health', details: [d('Practice', 'Maple Family Dental'), d('Phone', '(555) 010-0151')], links: [], notes: '' },
  { title: 'Pediatrician', category: 'Doctors & Health', details: [d('Phone', '(555) 010-0142')], links: [], notes: '' },
  { title: 'Rice cooker', category: 'Appliances & Warranties', details: [d('Model', 'NS-ZCC10'), d('Warranty ends', 'March 2027')], links: [], notes: '' },
  { title: 'Kids’ shoe sizes', category: 'Family Sizes', details: [d('Maya', '13 youth'), d('Leo', '9 toddler')], links: [], notes: '' },
];

export async function loadSampleRecords(): Promise<number> {
  const existing = new Set((await db.records.toArray()).filter((r) => !r.deletedAt).map((r) => `${r.category}|${r.title}`));
  const toAdd = SAMPLES.filter((s) => !existing.has(`${s.category as RecordCategory}|${s.title}`)).map((s) =>
    stamp({ ...s, photos: [] as string[] }),
  );
  if (toAdd.length) await db.records.bulkAdd(toAdd);
  return toAdd.length;
}
