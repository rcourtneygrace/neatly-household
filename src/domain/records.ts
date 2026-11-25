import type { DetailRow, RecordCategory, RecordEntry } from '../data/types';
import { RECORD_CATEGORIES } from '../data/types';

/** Categories shown in the list and the Show dropdown (Custom records are grouped last). */
export const LIST_CATEGORIES: RecordCategory[] = [...RECORD_CATEGORIES];

const CONTACT_SUGGESTIONS = ['Address', 'Website', 'Email', 'Hours', 'Good for'];

/** Starter labels from the spec's "Starter labels by category" table. */
export const STARTER_LABELS: Record<RecordCategory, string[]> = {
  'Paint & Finishes': ['Brand', 'Color', 'Finish'],
  'Products & Supplies': ['Brand', 'Where to buy'],
  'Home Sizes & Measurements': ['Size'],
  'Family Sizes': ['Size'],
  'Appliances & Warranties': ['Model', 'Serial number', 'Warranty ends'],
  'Home Contacts': ['Phone', 'Company'],
  'Doctors & Health': ['Phone', 'Practice'],
  Pets: [],
  Vehicles: [],
  'Services & Providers': ['Phone'],
  'Garden & Plants': [],
  'Schools & Childcare': ['Phone'],
  Custom: [],
};

/** Extra labels offered as chips under "Add detail". Free text is always allowed. */
export const SUGGESTED_LABELS: Record<RecordCategory, string[]> = {
  'Paint & Finishes': ['Brand', 'Color', 'Finish', 'Room', 'Color code', 'Where to buy'],
  'Products & Supplies': ['Brand', 'Where to buy', 'Size', 'Model', 'Replace'],
  'Home Sizes & Measurements': ['Size', 'Room', 'Brand', 'Where to buy'],
  'Family Sizes': ['Size', 'Shoe', 'Shirt', 'Pants', 'Ring'],
  'Appliances & Warranties': ['Brand', 'Model', 'Serial number', 'Warranty ends', 'Purchased', 'Where to buy'],
  'Home Contacts': ['Phone', 'Company', ...CONTACT_SUGGESTIONS],
  'Doctors & Health': ['Phone', 'Practice', ...CONTACT_SUGGESTIONS],
  Pets: ['Breed', 'Birthday', 'Vet', 'Phone', 'Food', 'Microchip'],
  Vehicles: ['Make', 'Model', 'Year', 'Tire size', 'Oil type', 'Phone'],
  'Services & Providers': ['Phone', 'Company', ...CONTACT_SUGGESTIONS],
  'Garden & Plants': ['Location', 'Water', 'Sun', 'Planted', 'Where to buy'],
  'Schools & Childcare': ['Phone', 'Address', 'Website', 'Email', 'Hours'],
  Custom: ['Phone', 'Brand', 'Size', 'Where to buy'],
};

export function isPhoneLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'phone';
}

/** First non-empty Phone value on a record, if any. */
export function phoneOf(record: Pick<RecordEntry, 'details'>): string | null {
  const row = record.details.find((d) => isPhoneLabel(d.label) && d.value.trim());
  return row ? row.value.trim() : null;
}

/** One-line summary from the first two or three detail values, e.g. "Benjamin Moore · Hale Navy · Satin". */
export function summaryOf(record: Pick<RecordEntry, 'details' | 'links'>): string {
  const values = record.details.map((d) => d.value.trim()).filter(Boolean).slice(0, 3);
  if (values.length < 2 && record.links.length > 0) {
    const name = linkDisplayName(record.links[0].label, record.links[0].url);
    values.push(`${name} link`);
  }
  return values.join(' · ');
}

/** "Buy on Amazon" → "Amazon"; falls back to the domain name. */
export function linkDisplayName(label: string, url: string): string {
  const fromLabel = label.replace(/^(buy|shop|order)\s+(on|at|from)\s+/i, '').trim();
  if (fromLabel) return fromLabel;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return 'Web';
  }
}

/** Search across title, labels, values and notes (spec). Link labels are included too. */
export function matchesSearch(record: RecordEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    record.title,
    record.notes,
    ...record.details.flatMap((d) => [d.label, d.value]),
    ...record.links.map((l) => l.label),
  ]
    .join('\n')
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** Drops rows with an empty value (spec: "Empty values are not saved"). */
export function cleanDetails(details: DetailRow[]): DetailRow[] {
  return details
    .map((d) => ({ label: d.label.trim(), value: d.value.trim() }))
    .filter((d) => d.value !== '')
    .map((d) => ({ label: d.label || 'Detail', value: d.value }));
}

/**
 * Changing category changes only the starter labels, never typed values:
 * rows that still have no value are swapped for the new category's starter rows;
 * rows with a value stay exactly as they are.
 */
export function switchCategory(details: DetailRow[], to: RecordCategory): DetailRow[] {
  const kept = details.filter((d) => d.value.trim() !== '');
  const keptLabels = new Set(kept.map((d) => d.label.trim().toLowerCase()));
  const starters = STARTER_LABELS[to]
    .filter((label) => !keptLabels.has(label.toLowerCase()))
    .map((label) => ({ label, value: '' }));
  return [...kept, ...starters];
}

export function starterRows(category: RecordCategory): DetailRow[] {
  return STARTER_LABELS[category].map((label) => ({ label, value: '' }));
}

/** Suggestion chips: the category's labels that are not already on the form. */
export function chipLabels(category: RecordCategory, details: DetailRow[]): string[] {
  const used = new Set(details.map((d) => d.label.trim().toLowerCase()));
  return SUGGESTED_LABELS[category].filter((l) => !used.has(l.toLowerCase()));
}

/** Records grouped by category in the fixed category order, titles sorted A–Z within a group. */
export function groupByCategory(records: RecordEntry[]): { category: RecordCategory; records: RecordEntry[] }[] {
  return LIST_CATEGORIES.map((category) => ({
    category,
    records: records
      .filter((r) => r.category === category)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
  })).filter((g) => g.records.length > 0);
}

export function countLabel(n: number): string {
  return `${n} ${n === 1 ? 'record' : 'records'}`;
}

/** Make a typed link safe to open: add https:// when missing, refuse non-web schemes. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
