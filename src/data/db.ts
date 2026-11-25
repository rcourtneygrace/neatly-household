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
  }
}

export const db = new NeatlyDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function stamp<T extends object>(row: T): T & { id: string; createdAt: string; updatedAt: string; deletedAt: null } {
  const now = nowISO();
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, ...row };
}
