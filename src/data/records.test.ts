import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteRecord, saveRecord } from './records';
import { ensureSeeded } from './seed';

const photo = () => ({ blob: new Blob(['full']), thumb: new Blob(['t']), width: 10, height: 10 });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded();
});

describe('seed', () => {
  it('creates one household, 12 departments and both routines', async () => {
    expect(await db.household.count()).toBe(1);
    expect(await db.departments.count()).toBe(12);
    expect((await db.routines.toArray()).map((r) => r.type).sort()).toEqual(['closing', 'opening']);
  });
});

describe('saveRecord', () => {
  it('saves a record with only a name', async () => {
    const id = await saveRecord({
      title: 'Garage door',
      category: 'Custom',
      details: [{ label: 'Brand', value: '' }],
      links: [],
      notes: '',
      keptPhotoIds: [],
      newPhotos: [],
    });
    const r = await db.records.get(id);
    expect(r?.title).toBe('Garage door');
    expect(r?.details).toEqual([]); // empty values are not saved
  });

  it('refuses a record with no name', async () => {
    await expect(
      saveRecord({ title: '  ', category: 'Custom', details: [], links: [], notes: '', keptPhotoIds: [], newPhotos: [] }),
    ).rejects.toThrow();
  });

  it('adds and removes photos', async () => {
    const id = await saveRecord({
      title: 'Filter',
      category: 'Products & Supplies',
      details: [],
      links: [],
      notes: '',
      keptPhotoIds: [],
      newPhotos: [photo(), photo()],
    });
    const r1 = (await db.records.get(id))!;
    expect(r1.photos).toHaveLength(2);
    expect(await db.photos.count()).toBe(2);

    await saveRecord(
      { title: 'Filter', category: 'Products & Supplies', details: [], links: [], notes: '', keptPhotoIds: [r1.photos[1]], newPhotos: [] },
      id,
    );
    const r2 = (await db.records.get(id))!;
    expect(r2.photos).toEqual([r1.photos[1]]);
    expect(await db.photos.count()).toBe(1);
  });
});

describe('deleteRecord', () => {
  it('removes the record content and its photos from the device', async () => {
    const id = await saveRecord({
      title: 'Old fridge',
      category: 'Appliances & Warranties',
      details: [{ label: 'Model', value: 'X1' }],
      links: [],
      notes: 'note',
      keptPhotoIds: [],
      newPhotos: [photo()],
    });
    await deleteRecord(id);
    const r = (await db.records.get(id))!;
    expect(r.deletedAt).toBeTruthy();
    expect(r.title).toBe('');
    expect(r.details).toEqual([]);
    expect(await db.photos.count()).toBe(0);
  });
});
