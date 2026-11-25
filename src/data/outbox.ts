/**
 * Change tracking for sync. A Dexie middleware notes every write to a synced table in the
 * "syncOutbox" table, inside the same transaction, so nothing is ever missed (updates,
 * hard deletes and clears included). Writes that come from the sync itself are not noted.
 */
import type Dexie from 'dexie';
import type { DBCore, DBCoreMutateRequest, DBCoreTransaction } from 'dexie';

export const SYNCED_TABLES = [
  'household',
  'departments',
  'routines',
  'tasks',
  'occurrences',
  'dayLogs',
  'vacations',
  'records',
  'photos',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
const SYNCED = new Set<string>(SYNCED_TABLES);

export interface OutboxEntry {
  key: string; // "<table>|<id>"
  tbl: SyncedTable;
  id: string;
  /** When the change was made on this phone; the newest change wins. */
  at: string;
}

const REMOTE = '__neatlyRemote';

/** Mark a Dexie transaction as applying changes from the server, so they are not sent back. */
export function markRemote(tx: { idbtrans: unknown }): void {
  (tx.idbtrans as Record<string, unknown>)[REMOTE] = true;
}

let onLocalChange: (() => void) | null = null;
/** Called (after the write) whenever this phone changes synced data. */
export function setLocalChangeListener(fn: (() => void) | null): void {
  onLocalChange = fn;
}

let lastAt = '';
/** A strictly increasing timestamp, so two quick edits to one row keep their order. */
export function changeTime(): string {
  let at = new Date().toISOString();
  if (at <= lastAt) at = new Date(Date.parse(lastAt) + 1).toISOString();
  lastAt = at;
  return at;
}

/**
 * Ids touched by a write, known without waiting, so the outbox note can be written in the same
 * tick as the write itself (Dexie's own middlewares need that). A whole-table clear() is not
 * noted; the app only clears tables when restoring a backup or joining a household.
 */
function keysOf(req: DBCoreMutateRequest): string[] {
  switch (req.type) {
    case 'add':
    case 'put':
      return req.values.map((v, i) => String((v as { id?: unknown }).id ?? req.keys?.[i]));
    case 'delete':
      return req.keys.map(String);
    case 'deleteRange':
      return [];
  }
}

export function installOutbox(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'neatly-outbox',
    create(down: DBCore): DBCore {
      const outbox = () => down.table('syncOutbox');
      return {
        ...down,
        transaction(stores, mode, options) {
          const widen = mode === 'readwrite' && stores.some((s) => SYNCED.has(s)) && !stores.includes('syncOutbox');
          return down.transaction(widen ? [...stores, 'syncOutbox'] : stores, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!SYNCED.has(name)) return table;
          return {
            ...table,
            mutate(req) {
              const trans = req.trans as DBCoreTransaction & Record<string, unknown>;
              const keys = trans[REMOTE] ? [] : keysOf(req);
              if (!keys.length) return table.mutate(req);
              const at = changeTime();
              const noted = outbox().mutate({
                type: 'put',
                trans: req.trans,
                values: keys.map((id) => ({ key: `${name}|${id}`, tbl: name, id, at })),
              });
              const res = table.mutate(req);
              return Promise.all([res, noted]).then(([r]) => {
                if (onLocalChange) setTimeout(onLocalChange, 0);
                return r;
              });
            },
          };
        },
      };
    },
  });
}
