import Dexie, { type EntityTable } from 'dexie';
import type {
  DayLog,
  Department,
  Household,
  Occurrence,
  Photo,
  RecordEntry,
  RoutineTemplate,
  Task,
  VacationPeriod,
} from './types';
import { installOutbox, type OutboxEntry } from './outbox';

export class NeatlyDB extends Dexie {
  household!: EntityTable<Household, 'id'>;
  departments!: EntityTable<Department, 'id'>;
  routines!: EntityTable<RoutineTemplate, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  occurrences!: EntityTable<Occurrence, 'id'>;
  dayLogs!: EntityTable<DayLog, 'id'>;
  vacations!: EntityTable<VacationPeriod, 'id'>;
  records!: EntityTable<RecordEntry, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  /** Sync bookkeeping: rows changed on this phone and not yet sent, and the sync settings. */
  syncOutbox!: EntityTable<OutboxEntry, 'key'>;
  syncMeta!: EntityTable<{ key: string; value: unknown }, 'key'>;

  constructor(name = 'neatly-household') {
    super(name);
    // Only indexed fields are listed. Add new versions below; never edit a shipped one.
    this.version(1).stores({
      household: 'id',
      departments: 'id, order',
      routines: 'id, type',
      tasks: 'id, departmentId, cadence, archived, updatedAt',
      occurrences: 'id, taskId, periodStart, periodEnd, status, [taskId+periodStart]',
      dayLogs: 'id, &date',
      vacations: 'id, startDate',
      records: 'id, category, updatedAt',
      photos: 'id, recordId',
    });
    this.version(2).stores({
      syncOutbox: 'key',
      syncMeta: 'key',
    });
    installOutbox(this);
  }
}

export const db = new NeatlyDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** One occurrence per task and period, with the same id on every phone, so shared phones merge it. */
export function occurrenceId(taskId: string, periodStart: string): string {
  return `${taskId}|${periodStart}`;
}

/** One day log per date, with the same id on every phone. */
export function dayLogId(date: string): string {
  return `day|${date}`;
}

export function stamp<T extends object>(row: T): T & { id: string; createdAt: string; updatedAt: string; deletedAt: null } {
  const now = nowISO();
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...row };
}
