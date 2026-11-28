import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../../ui';
import { ActionSheet } from '../../ui/ActionSheet';
import { useNow } from '../../ui/useNow';
import { updateHousehold, useHousehold } from '../../data/hooks';
import { currentOrNextVacation } from '../../data/today';
import { db } from '../../data/db';
import { useHouseholdDay } from '../../data/day';
import { addDays, hhmmLabel, toDay, weekdayDate } from '../../domain/dates';
import { holidayOn, offDaySpans, yearlyHolidays } from '../../domain/holidays';
import { dayOffOn } from '../../domain/schedule';
import { exportBackup, importBackup, shareOrDownload } from '../../data/backup';
import { loadSampleRecords } from '../../data/sampleRecords';
import { loadSuggestedTasks } from '../../data/suggestedTasks';
import { SharingSection, TellSomeoneSection } from './SharingSection';
import { Group, RowButton, RowField, RowLink } from './rows';
import { PlanDaysOffSheet, TakeTodayOffSheet } from './TimeAwaySheets';
import { VacationSheet } from './VacationSheet';
import '../records/records.css';
import '../records/record-form.css';
import './settings.css';
import './plan-settings.css';

/**
 * Settings, opened from the gear on each tab. Grouped like iOS Settings: Household, Time away,
 * People, Share Neatly, Backup, Getting started. Each group is a card of rows with a short note.
 */
export function SettingsScreen() {
  const navigate = useNavigate();
  const household = useHousehold();
  const now = useNow();
  const T = useHouseholdDay(now) ?? toDay(now);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string>();
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [vacationSheet, setVacationSheet] = useState(false);
  const [todaySheet, setTodaySheet] = useState(false);
  const [planSheet, setPlanSheet] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trip = useLiveQuery(async () => currentOrNextVacation(await db.vacations.toArray(), T), [T]);
  // Today's day off (marked, or a yearly day nobody set to work) and the next one coming up
  const off = useLiveQuery(async () => {
    const h = await db.household.toCollection().first();
    const yearly = h ? yearlyHolidays(h) : [];
    const vacations = (await db.vacations.toArray()).filter((v) => !v.deletedAt);
    const log = await db.dayLogs.where('date').equals(T).first();
    const spans = offDaySpans({ today: T, vacations, holidays: yearly, workdays: new Set(log?.workday ? [T] : []) });
    const today = dayOffOn(T, spans);
    const next = spans
      .filter((s) => s.kind === 'dayOff' && s.startDate > T)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return {
      today: today ? { label: today.label ?? null, yearly: !!holidayOn(T, yearly) } : null,
      next: next ?? null,
      yearlyCount: yearly.length,
    };
  }, [T, household?.updatedAt]);

  useEffect(() => {
    if (household) setName(household.name);
  }, [household?.id, household?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // The status note fades after a few seconds
  useEffect(() => {
    if (!status || status.endsWith('…')) return;
    const id = window.setTimeout(() => setStatus(undefined), 4000);
    return () => window.clearTimeout(id);
  }, [status]);

  if (!household) return null;
  const onVacation = !!trip && trip.startDate <= T;
  const hours = household.businessHours;

  const saveName = () => {
    const n = name.trim();
    if (n && n !== household.name) updateHousehold({ name: n });
    else setName(household.name);
  };

  const vacationDetail = !trip
    ? 'Away for a few days or more'
    : onVacation
      ? trip.endDate
        ? `Back ${weekdayDate(addDays(trip.endDate, 1))}`
        : "Until you're back"
      : `Planned ${weekdayDate(trip.startDate)}${trip.endDate ? ` – back ${weekdayDate(addDays(trip.endDate, 1))}` : ''}`;

  return (
    <main className="settings">
      <header className="detail-header">
        <button type="button" className="back-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div className="detail-header__titles">
          <h1 className="detail-header__title">Settings</h1>
        </div>
      </header>

      <Group title="Household">
        <RowField icon="home" label="Household name">
          <input
            className="set-row__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            enterKeyHint="done"
          />
        </RowField>
        <RowLink
          icon="clock"
          title="Business hours"
          detail={`Weekdays ${hhmmLabel(hours.weekdayOpen)} – ${hhmmLabel(hours.weekdayClose)}`}
          to="/settings/hours"
        />
        <RowLink icon="sliders" title="Plan settings" detail="Week, month, year and seasons" to="/settings/plan" />
      </Group>

      <Group title="Time away" footer="Time away never counts against you. Anything due waits for you.">
        <RowButton
          icon="sun"
          title={off?.today ? 'Today is a day off' : 'Take today off'}
          detail={
            onVacation ? "You're on vacation" : off?.today ? (off.today.label ?? 'Nothing counts today') : 'Rest without falling behind'
          }
          disabled={onVacation}
          chevron
          onClick={() => setTodaySheet(true)}
        />
        <RowButton
          icon="leaf"
          title="Plan days off"
          detail={
            off?.next
              ? `Next: ${off.next.label ? `${off.next.label} · ` : ''}${weekdayDate(off.next.startDate)}`
              : 'Single days, holidays and birthdays'
          }
          chevron
          onClick={() => setPlanSheet(true)}
        />
        <RowButton
          icon="suitcase"
          title={onVacation ? 'On vacation' : 'Plan a vacation'}
          detail={vacationDetail}
          chevron
          onClick={() => setVacationSheet(true)}
        />
      </Group>

      <SharingSection onStatus={setStatus} />
      <TellSomeoneSection onStatus={setStatus} />

      <Group title="Backup" footer="Save a backup file now and then, for example to Files or iCloud Drive.">
        <RowButton
          icon="save"
          title="Save a backup"
          onClick={async () => {
            setStatus('Preparing backup…');
            try {
              await shareOrDownload(await exportBackup());
              setStatus(undefined);
            } catch {
              setStatus('The backup could not be made. Please try again.');
            }
          }}
        />
        <RowButton icon="restore" title="Restore from a backup" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingImport(f);
            e.target.value = '';
          }}
        />
      </Group>

      <Group title="Getting started" footer="Nothing already in Neatly is changed.">
        <RowButton
          icon="sparkle"
          title="Add suggested tasks"
          detail="A starter plan for each part of the house"
          onClick={async () => {
            const n = await loadSuggestedTasks();
            setStatus(n ? `Added ${n} suggested tasks.` : 'The suggested tasks are already on your plan.');
          }}
        />
        <RowButton
          icon="tab-records"
          title="Add example records"
          detail="Paint, filters and contacts, to see how Records works"
          onClick={async () => {
            const n = await loadSampleRecords();
            setStatus(n ? `Added ${n} example records.` : 'The example records are already here.');
          }}
        />
      </Group>

      {status && (
        <p className="settings__toast" role="status">
          {status}
        </p>
      )}

      <TakeTodayOffSheet open={todaySheet} today={T} off={off?.today ?? null} onClose={() => setTodaySheet(false)} />
      <PlanDaysOffSheet open={planSheet} today={T} yearlyCount={off?.yearlyCount ?? 0} onClose={() => setPlanSheet(false)} />
      <VacationSheet
        open={vacationSheet}
        today={T}
        existing={trip ?? undefined}
        onClose={() => setVacationSheet(false)}
      />

      <ActionSheet
        open={!!pendingImport}
        title="Restore this backup?"
        message="Everything on this phone will be replaced with what is in the backup file."
        onClose={() => setPendingImport(null)}
        actions={[
          {
            label: 'Replace and restore',
            tone: 'clay',
            onSelect: async () => {
              const f = pendingImport!;
              setPendingImport(null);
              try {
                await importBackup(f);
                setStatus('Backup restored.');
              } catch (err) {
                setStatus((err as Error).message);
              }
            },
          },
        ]}
      />
    </main>
  );
}
