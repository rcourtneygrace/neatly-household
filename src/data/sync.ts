/**
 * Household sharing. Phones that share a household send their changes to the Neatly sync
 * server and fetch everyone else's. The invite key "<id>.<secret>" is the only credential;
 * whoever has it is part of the household.
 *
 * Every change carries the time it was made on the phone; the newest change to a row wins.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { markRemote, setLocalChangeListener, SYNCED_TABLES, type OutboxEntry, type SyncedTable } from './outbox';

export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? 'https://neatly-household-sync.neatly-household.workers.dev';
/** Where the app lives; invite links and the "try Neatly" link point here. */
export const APP_URL = 'https://rcourtneygrace.github.io/neatly-household/';

const KEY_RE = /([0-9a-f]{32}\.[0-9a-f]{64})/;

export interface SyncState {
  key: string | null;
  cursor: number;
  lastSyncedAt: string | null;
  error: string | null;
}

const EMPTY: SyncState = { key: null, cursor: 0, lastSyncedAt: null, error: null };

async function getState(): Promise<SyncState> {
  const row = await db.syncMeta.get('state');
  return { ...EMPTY, ...(row?.value as Partial<SyncState> | undefined) };
}

async function setState(changes: Partial<SyncState>): Promise<void> {
  const next = { ...(await getState()), ...changes };
  await db.syncMeta.put({ key: 'state', value: next });
}

export function useSyncState(): SyncState | undefined {
  return useLiveQuery(getState);
}

/** The link to send someone so they join this household. */
export function inviteLink(key: string): string {
  return `${APP_URL}#/join/${key}`;
}

/** Find an invite key in a pasted link or code. */
export function parseInvite(text: string): string | null {
  return KEY_RE.exec(text.trim().toLowerCase())?.[1] ?? null;
}

/* ---------- Rows on the wire: photos travel as data URLs ---------- */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function toWire(tbl: SyncedTable, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (tbl !== 'photos') return row;
  return { ...row, blob: await blobToDataUrl(row.blob as Blob), thumb: await blobToDataUrl(row.thumb as Blob) };
}

async function fromWire(tbl: SyncedTable, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (tbl !== 'photos') return row;
  const blob = async (u: unknown) => (await fetch(u as string)).blob();
  return { ...row, blob: await blob(row.blob), thumb: await blob(row.thumb) };
}

interface WireChange {
  tbl: SyncedTable;
  id: string;
  at: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

async function post<T>(path: string, body: unknown, key?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SYNC_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('offline');
  }
  if (res.status === 401) throw new Error('not allowed');
  if (!res.ok) throw new Error(`server ${res.status}`);
  return res.json() as Promise<T>;
}

/* ---------- Applying the server's changes ---------- */

/** Apply changes from the server. A newer change made on this phone and not yet sent wins. */
async function applyRemote(changes: WireChange[]): Promise<void> {
  if (!changes.length) return;
  // Decode photos before the transaction: IndexedDB transactions close across fetch()
  const decoded = await Promise.all(
    changes.map(async (c) => ({ ...c, data: c.data && !c.deleted ? await fromWire(c.tbl, c.data) : null })),
  );
  const tables = [...new Set(decoded.map((c) => c.tbl))].map((t) => db.table(t));
  await db.transaction('rw', [...tables, db.syncOutbox], async (tx) => {
    markRemote(tx);
    for (const c of decoded) {
      const pending = await db.syncOutbox.get(`${c.tbl}|${c.id}`);
      if (pending && pending.at >= c.at) continue;
      if (pending) await db.syncOutbox.delete(pending.key);
      const table = db.table(c.tbl);
      if (c.deleted || !c.data) {
        await table.delete(c.id);
        continue;
      }
      if (c.tbl === 'dayLogs') {
        // One day log per date: a log for the same day made on another phone replaces ours
        const date = (c.data as { date: string }).date;
        await db.dayLogs.where('date').equals(date).and((l) => l.id !== c.id).delete();
      }
      await table.put(c.data);
    }
  });
}

/* ---------- The sync loop ---------- */

let running: Promise<void> | null = null;
let again = false;

/** Send what changed here and fetch what changed elsewhere. Safe to call often. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(): Promise<void> {
  const state = await getState();
  if (!state.key) return;
  try {
    const outbox = await db.syncOutbox.toArray();
    const sent = new Map<string, string>();
    const changes: WireChange[] = [];
    for (const e of outbox) {
      const row = (await db.table(e.tbl).get(e.id)) as Record<string, unknown> | undefined;
      changes.push({ tbl: e.tbl, id: e.id, at: e.at, deleted: !row, data: row ? await toWire(e.tbl, row) : null });
      sent.set(e.key, e.at);
    }

    let cursor = state.cursor;
    let first = true;
    // Send in modest chunks (photos are large); fetch until caught up
    for (let i = 0; first || i < changes.length; i += 25) {
      const chunk = changes.slice(i, i + 25);
      let res = await post<{ changes: (WireChange & { seq: number })[]; cursor: number; more: boolean }>(
        '/sync',
        { changes: chunk, since: cursor },
        state.key,
      );
      await clearSent(chunk, sent);
      await applyRemote(res.changes.filter((c) => sent.get(`${c.tbl}|${c.id}`) !== c.at));
      cursor = res.cursor;
      while (res.more) {
        res = await post('/sync', { changes: [], since: cursor }, state.key);
        await applyRemote(res.changes.filter((c) => sent.get(`${c.tbl}|${c.id}`) !== c.at));
        cursor = res.cursor;
      }
      await setState({ cursor });
      first = false;
    }
    await setState({ lastSyncedAt: new Date().toISOString(), error: null });
  } catch (err) {
    const msg = (err as Error).message;
    await setState({ error: msg === 'offline' ? 'offline' : msg === 'not allowed' ? 'not allowed' : 'failed' });
  }
}

/** Forget outbox entries that were sent, unless the row changed again meanwhile. */
async function clearSent(chunk: WireChange[], sent: Map<string, string>): Promise<void> {
  if (!chunk.length) return;
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const c of chunk) {
      const key = `${c.tbl}|${c.id}`;
      const e = await db.syncOutbox.get(key);
      if (e && e.at === sent.get(key)) await db.syncOutbox.delete(key);
    }
  });
}

/* ---------- Sharing, joining and leaving ---------- */

/** Start sharing this phone's household: make an invite key and send everything up. */
export async function startSharing(): Promise<string> {
  const { key } = await post<{ key: string }>('/households', {});
  const at = new Date().toISOString();
  await db.transaction('rw', [db.syncOutbox, ...SYNCED_TABLES.map((t) => db.table(t))], async () => {
    await db.syncOutbox.clear();
    for (const tbl of SYNCED_TABLES) {
      const ids = (await db.table(tbl).toCollection().primaryKeys()) as string[];
      await db.syncOutbox.bulkPut(ids.map((id): OutboxEntry => ({ key: `${tbl}|${id}`, tbl, id, at })));
    }
  });
  await setState({ key, cursor: 0, lastSyncedAt: null, error: null });
  await syncNow();
  const s = await getState();
  if (s.error) throw new Error(s.error);
  return key;
}

/** Join a shared household: everything on this phone is replaced by the household's data. */
export async function joinHousehold(key: string): Promise<void> {
  // Check the key before wiping anything
  const res = await post<{ changes: WireChange[] }>('/sync', { changes: [], since: 0 }, key);
  if (!res.changes.length) throw new Error('empty');
  await db.transaction('rw', [db.syncOutbox, db.syncMeta, ...SYNCED_TABLES.map((t) => db.table(t))], async (tx) => {
    markRemote(tx);
    for (const t of SYNCED_TABLES) await db.table(t).clear();
    await db.syncOutbox.clear();
    await db.syncMeta.put({ key: 'state', value: { ...EMPTY, key } satisfies SyncState });
  });
  await syncNow();
  const s = await getState();
  if (s.error) throw new Error(s.error);
}

/** Stop syncing. This phone keeps its copy of the household. */
export async function leaveHousehold(): Promise<void> {
  await db.transaction('rw', db.syncMeta, db.syncOutbox, async () => {
    await db.syncMeta.put({ key: 'state', value: EMPTY });
    await db.syncOutbox.clear();
  });
}

/** Keep in step: on start, when the app comes back, when online, every 30s, and shortly after edits. */
export function startSyncLoop(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  };
  setLocalChangeListener(soon);
  const visible = () => document.visibilityState === 'visible';
  document.addEventListener('visibilitychange', () => visible() && void syncNow());
  window.addEventListener('online', () => void syncNow());
  setInterval(() => visible() && void syncNow(), 30_000);
  void syncNow();
}
