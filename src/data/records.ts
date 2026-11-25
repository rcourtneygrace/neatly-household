import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId, nowISO, stamp } from './db';
import type { DetailRow, ID, Photo, RecordCategory, RecordEntry, RecordLink } from './types';
import { cleanDetails } from '../domain/records';
import type { ProcessedPhoto } from './photos';

export function useRecords(): RecordEntry[] | undefined {
  return useLiveQuery(() => db.records.filter((r) => !r.deletedAt).toArray());
}

export function useRecord(id: ID | undefined): RecordEntry | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const r = await db.records.get(id);
    return r && !r.deletedAt ? r : null;
  }, [id]);
}

export function usePhotos(ids: ID[] | undefined): Photo[] | undefined {
  const key = ids?.join(',') ?? '';
  return useLiveQuery(async () => {
    if (!ids || ids.length === 0) return [];
    const rows = await db.photos.bulkGet(ids);
    return rows.filter((p): p is Photo => !!p);
  }, [key]);
}

/** Thumbnail blob of the first photo for each record id, for list rows. */
export function useFirstThumbs(records: RecordEntry[] | undefined): Map<ID, Blob> | undefined {
  const key = records?.map((r) => `${r.id}:${r.photos[0] ?? ''}`).join(',') ?? '';
  return useLiveQuery(async () => {
    const map = new Map<ID, Blob>();
    if (!records) return map;
    const firstIds = records.filter((r) => r.photos.length > 0).map((r) => r.photos[0]);
    const photos = await db.photos.bulkGet(firstIds);
    for (const p of photos) if (p) map.set(p.recordId, p.thumb);
    return map;
  }, [key]);
}

export interface RecordDraft {
  title: string;
  category: RecordCategory;
  details: DetailRow[];
  links: RecordLink[];
  notes: string;
  /** Existing photo ids kept, in order */
  keptPhotoIds: ID[];
  /** New photos added in this edit, in order after the kept ones */
  newPhotos: ProcessedPhoto[];
}

/** Create or update a record and its photos in one transaction. Returns the record id. */
export async function saveRecord(draft: RecordDraft, existingId?: ID): Promise<ID> {
  const title = draft.title.trim();
  if (!title) throw new Error('A record needs a name');
  const recordId = existingId ?? newId();
  const now = nowISO();

  await db.transaction('rw', db.records, db.photos, async () => {
    const existing = existingId ? await db.records.get(existingId) : undefined;

    // Remove photos that were taken off the record
    if (existing) {
      const removed = existing.photos.filter((pid) => !draft.keptPhotoIds.includes(pid));
      if (removed.length) await db.photos.bulkDelete(removed);
    }

    const added: Photo[] = draft.newPhotos.map((p) => ({
      ...stamp({ recordId, blob: p.blob, thumb: p.thumb, width: p.width, height: p.height }),
    }));
    if (added.length) await db.photos.bulkAdd(added);

    const fields = {
      title,
      category: draft.category,
      details: cleanDetails(draft.details),
      links: draft.links.filter((l) => l.url.trim()),
      notes: draft.notes.trim(),
      photos: [...draft.keptPhotoIds, ...added.map((p) => p.id)],
    };

    if (existing) {
      await db.records.update(recordId, { ...fields, updatedAt: now });
    } else {
      await db.records.add({ id: recordId, createdAt: now, updatedAt: now, deletedAt: null, ...fields });
    }
  });
  return recordId;
}

/** Delete a record and remove its photos from the device (spec). */
export async function deleteRecord(id: ID): Promise<void> {
  await db.transaction('rw', db.records, db.photos, async () => {
    await db.photos.where('recordId').equals(id).delete();
    // Soft-delete keeps a tombstone for future sync; content is cleared so nothing personal lingers.
    await db.records.update(id, {
      deletedAt: nowISO(),
      updatedAt: nowISO(),
      title: '',
      details: [],
      links: [],
      notes: '',
      photos: [],
    });
  });
}

/** Add one photo straight from the record detail screen ("+" tile). */
export async function addPhotoToRecord(recordId: ID, photo: ProcessedPhoto): Promise<void> {
  await db.transaction('rw', db.records, db.photos, async () => {
    const record = await db.records.get(recordId);
    if (!record) return;
    const row = stamp({ recordId, blob: photo.blob, thumb: photo.thumb, width: photo.width, height: photo.height });
    await db.photos.add(row);
    await db.records.update(recordId, { photos: [...record.photos, row.id], updatedAt: nowISO() });
  });
}
