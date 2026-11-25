import { describe, expect, it } from 'vitest';
import {
  chipLabels,
  cleanDetails,
  groupByCategory,
  matchesSearch,
  normalizeUrl,
  phoneOf,
  summaryOf,
  switchCategory,
} from './records';
import type { RecordEntry } from '../data/types';

const rec = (over: Partial<RecordEntry>): RecordEntry => ({
  id: Math.random().toString(36),
  createdAt: '',
  updatedAt: '',
  title: 'Thing',
  category: 'Products & Supplies',
  details: [],
  photos: [],
  links: [],
  notes: '',
  ...over,
});

describe('summaryOf', () => {
  it('joins the first three detail values', () => {
    const r = rec({
      details: [
        { label: 'Brand', value: 'Benjamin Moore' },
        { label: 'Color', value: 'Hale Navy' },
        { label: 'Finish', value: 'Satin' },
        { label: 'Room', value: 'Kitchen' },
      ],
    });
    expect(summaryOf(r)).toBe('Benjamin Moore · Hale Navy · Satin');
  });

  it('mentions a link when there are few values', () => {
    const r = rec({ details: [{ label: 'Brand', value: 'Bosch' }], links: [{ label: 'Buy on Amazon', url: 'https://amazon.com' }] });
    expect(summaryOf(r)).toBe('Bosch · Amazon link');
  });

  it('skips empty values', () => {
    expect(summaryOf(rec({ details: [{ label: 'Brand', value: '  ' }, { label: 'Size', value: '16 × 25 × 1 in' }] }))).toBe(
      '16 × 25 × 1 in',
    );
  });
});

describe('phoneOf', () => {
  it('finds a Phone detail regardless of case', () => {
    expect(phoneOf(rec({ details: [{ label: 'phone', value: '(555) 010-0188' }] }))).toBe('(555) 010-0188');
  });
  it('ignores an empty phone', () => {
    expect(phoneOf(rec({ details: [{ label: 'Phone', value: '' }] }))).toBeNull();
  });
});

describe('matchesSearch', () => {
  const r = rec({
    title: 'Plumber',
    details: [{ label: 'Company', value: 'Rivera Plumbing' }],
    notes: 'Ask for Sam',
  });
  it.each([
    ['title', 'plumb'],
    ['label', 'company'],
    ['value', 'rivera'],
    ['note', 'sam'],
  ])('matches by %s', (_, q) => expect(matchesSearch(r, q)).toBe(true));
  it('does not match unrelated text', () => expect(matchesSearch(r, 'paint')).toBe(false));
  it('empty query matches everything', () => expect(matchesSearch(r, '  ')).toBe(true));
});

describe('switchCategory', () => {
  it('keeps typed values and swaps only empty starter rows', () => {
    const before = [
      { label: 'Brand', value: 'Sherwin-Williams' },
      { label: 'Color', value: '' },
      { label: 'Finish', value: '' },
    ];
    const after = switchCategory(before, 'Home Contacts');
    expect(after).toEqual([
      { label: 'Brand', value: 'Sherwin-Williams' },
      { label: 'Phone', value: '' },
      { label: 'Company', value: '' },
    ]);
  });

  it('does not duplicate a label that already has a value', () => {
    const after = switchCategory([{ label: 'Phone', value: '555' }], 'Doctors & Health');
    expect(after).toEqual([
      { label: 'Phone', value: '555' },
      { label: 'Practice', value: '' },
    ]);
  });
});

describe('cleanDetails', () => {
  it('drops rows with empty values and trims', () => {
    expect(
      cleanDetails([
        { label: ' Brand ', value: ' Bosch ' },
        { label: 'Model', value: '' },
        { label: '', value: 'blue' },
      ]),
    ).toEqual([
      { label: 'Brand', value: 'Bosch' },
      { label: 'Detail', value: 'blue' },
    ]);
  });
});

describe('chipLabels', () => {
  it('offers contact suggestions not already used', () => {
    expect(chipLabels('Home Contacts', [{ label: 'Phone', value: '' }, { label: 'Company', value: '' }])).toEqual([
      'Address',
      'Website',
      'Email',
      'Hours',
      'Good for',
    ]);
  });
});

describe('groupByCategory', () => {
  it('orders groups by the fixed category list and titles A–Z', () => {
    const groups = groupByCategory([
      rec({ title: 'Plumber', category: 'Home Contacts' }),
      rec({ title: 'Walls', category: 'Paint & Finishes' }),
      rec({ title: 'Electrician', category: 'Home Contacts' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Paint & Finishes', 'Home Contacts']);
    expect(groups[1].records.map((r) => r.title)).toEqual(['Electrician', 'Plumber']);
  });
});

describe('normalizeUrl', () => {
  it('adds https when missing', () => expect(normalizeUrl('amazon.com/x')).toBe('https://amazon.com/x'));
  it('refuses non-web schemes', () => expect(normalizeUrl('javascript:alert(1)')).toBeNull());
  it('empty is null', () => expect(normalizeUrl(' ')).toBeNull());
});
