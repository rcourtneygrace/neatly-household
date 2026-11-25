/**
 * Local backup: everything (including photos) in one JSON file the person keeps.
 * Nothing is uploaded; the file goes to the iOS share sheet or a download.
 */
import { db } from './db';

const FORMAT = 'neatly-household-backup';
const VERSION = 1;

type Tables = 'household' | 'departments' | 'routines' | 'tasks' | 'occurrences' | 'dayLogs' | 'vacations' | 'records' | 'photos';
const TABLES: Tables[] = ['household', 'departments', 'routines', 'tasks', 'occurrences', 'dayLogs', 'vacations', 'records', 'photos'];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function exportBackup(): Promise<File> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  data.photos = await Promise.all(
    (data.photos as { blob: Blob; thumb: Blob }[]).map(async (p) => ({
      ...p,
      blob: await blobToDataUrl(p.blob),
      thumb: await blobToDataUrl(p.thumb),
    })),
  );
  const json = JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data });
  const date = new Date().toISOString().slice(0, 10);
  return new File([json], `neatly-backup-${date}.json`, { type: 'application/json' });
}

/** Hand the file to the iOS share sheet ("Save to Files"), or download it elsewhere. */
export async function shareOrDownload(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Neatly backup' });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Replace everything on this phone with the backup's contents. */
export async function importBackup(file: File): Promise<void> {
  let parsed: { format?: string; version?: number; data?: Record<string, unknown[]> };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a Neatly backup.');
  }
  if (parsed.format !== FORMAT || !parsed.data) throw new Error('This file is not a Neatly backup.');
  if ((parsed.version ?? 0) > VERSION) throw new Error('This backup is from a newer version of Neatly. Update the app first.');

  const photos = await Promise.all(
    ((parsed.data.photos ?? []) as { blob: string; thumb: string }[]).map(async (p) => ({
      ...p,
      blob: await dataUrlToBlob(p.blob),
      thumb: await dataUrlToBlob(p.thumb),
    })),
  );

  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = t === 'photos' ? photos : (parsed.data![t] ?? []);
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}
