/**
 * Data model from the functional spec. Every stored row carries sync fields
 * (id, createdAt, updatedAt, deletedAt) so accounts and sync can be added later.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD (local calendar date)
export type ISODateTime = string; // full ISO timestamp

export interface SyncFields {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime | null;
}

export type SeasonName = 'spring' | 'summer' | 'fall' | 'winter';
export type SeasonPreset = 'calendar' | 'weather' | 'custom';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface BusinessHours {
  weekdayOpen: string; // "07:00"
  weekdayClose: string; // "21:00"
  weekendOpen: string;
  weekendClose: string;
}

export interface Household extends SyncFields {
  name: string;
  mission: string;
  timezone: string;
  weekStart: Weekday;
  monthStart: number; // day of month the month begins on (1 = the 1st)
  yearStart: number; // month index the year begins on (0 = January)
  seasonPreset: SeasonPreset;
  /** Start date of each season as "MM-DD" */
  seasonStartDates: Record<SeasonName, string>;
  clearWhenChecked: boolean;
  accent: string;
  unlocked: boolean; // paid unlock, not used until public release
  businessHours: BusinessHours;
  /** Holidays taken off every year (ids from domain/holidays). Missing: the defaults. */
  holidays?: string[];
}

export interface Department extends SyncFields {
  name: string;
  order: number;
  enabled: boolean;
}

export interface RoutineTemplate extends SyncFields {
  type: 'opening' | 'closing';
  steps: { text: string; order: number }[];
}

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'yearly';
/** "specific" = a set day / season / month; "every" = any time in the period */
export type TimingMode = 'specific' | 'every';

/**
 * timingValue meaning by cadence (timingMode "specific"):
 *  weekly   → weekday numbers, e.g. [3] for Wednesday
 *  monthly  → day of month: 1..28, or -1 for the last day
 *  seasonal → season names, e.g. ["fall"]
 *  yearly   → month index 0..11
 */
export type TimingValue = number[] | SeasonName[] | number | null;

export interface Task extends SyncFields {
  name: string;
  departmentId: ID;
  cadence: Cadence;
  timingMode: TimingMode;
  timingValue: TimingValue;
  steps: string[];
  notes: string;
  recordId?: ID | null;
  paused: boolean;
  archived: boolean;
  /** Day the task was added or last un-paused; nothing before it is carried over. */
  activeSince?: string | null;
}

export type OccurrenceStatus = 'open' | 'done' | 'deferred' | 'carriedOver';

export interface Occurrence extends SyncFields {
  taskId: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  /** The day it is due, when the task has a specific day */
  dueDate?: ISODate | null;
  /** The day it is on Today's list: a Build Your Day pick, or a pushed / "Give it a day" day */
  plannedFor?: ISODate | null;
  /** true when plannedFor was set by "Push to a later date" or "Give it a day": locked on that day */
  pinned?: boolean;
  status: OccurrenceStatus;
  completedAt?: ISODateTime | null;
  /** The household day it was checked off (Today's day, which runs opening to opening) */
  completedOn?: ISODate | null;
  /** Skip reason ("deferred" in code, "Skip" on screen); null when skipped without a reason */
  deferReason?: string | null;
}

export interface DayLog extends SyncFields {
  date: ISODate;
  openingStatus: 'open' | 'done';
  openingAt?: ISODateTime | null;
  closingStatus: 'open' | 'done';
  closingAt?: ISODateTime | null;
  tasksPlanned: number;
  tasksCompleted: number;
  /** Build Your Day finished for this day */
  dayBuilt?: boolean;
  /** Build Your Day closed without building (Today shows "Plan my day") */
  dayDismissed?: boolean;
  /** The day's list as built: locked (fixed for today) or chosen */
  picks?: { taskId: ID; kind: 'locked' | 'chosen' }[];
  /** "Open early": this day started before its opening time */
  startedEarly?: boolean;
  /** A yearly holiday someone chose to work ("Back to work") */
  workday?: boolean;
}

export interface VacationPeriod extends SyncFields {
  /** "dayOff": one day off (startDate = endDate), ends by itself. Missing means vacation mode. */
  kind?: 'vacation' | 'dayOff';
  /** A day off's name, such as "Thanksgiving" */
  label?: string | null;
  startDate: ISODate;
  /** null while vacation mode is on */
  endDate: ISODate | null;
  /** The one-time "Welcome back" card was dismissed */
  welcomeSeen?: boolean;
}

export interface DetailRow {
  label: string;
  value: string;
}

export interface RecordLink {
  label: string;
  url: string;
}

export interface RecordEntry extends SyncFields {
  title: string;
  category: RecordCategory;
  details: DetailRow[];
  photos: ID[]; // ids in the photos table
  links: RecordLink[];
  notes: string;
}

export interface Photo extends SyncFields {
  recordId: ID;
  blob: Blob; // resized to ~1600px long edge
  thumb: Blob; // small square-ish thumbnail for list rows
  width: number;
  height: number;
}

export const RECORD_CATEGORIES = [
  'Paint & Finishes',
  'Products & Supplies',
  'Home Sizes & Measurements',
  'Family Sizes',
  'Appliances & Warranties',
  'Home Contacts',
  'Doctors & Health',
  'Pets',
  'Vehicles',
  'Services & Providers',
  'Garden & Plants',
  'Schools & Childcare',
  'Custom',
] as const;

export type RecordCategory = (typeof RECORD_CATEGORIES)[number];
