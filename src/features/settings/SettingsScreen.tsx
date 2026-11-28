import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../../ui';
import { ActionSheet } from '../../ui/ActionSheet';
import { useNow } from '../../ui/useNow';
import { updateHousehold, useHousehold } from '../../data/hooks';
import { cancelDayOff, currentOrNextVacation, endVacation, takeDayOff } from '../../data/today';
import { db } from '../../data/db';
import { useHouseholdDay } from '../../data/day';
import { addDays, hhmmLabel, toDay, weekdayDate } from '../../domain/dates';
import { holidayOn, holidaysOf, offDaySpans } from '../../domain/holidays';
import { dayOffOn } from '../../domain/schedule';
import { exportBackup, importBackup, shareOrDownload } from '../../data/backup';
import { loadSampleRecords } from '../../data/sampleRecords';
import { loadSuggestedTasks } from '../../data/suggestedTasks';
import { SharingSection, TellSomeoneSection } from './SharingSection';
import { Group, RowButton, RowField, RowLink, RowToggle } from './rows';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const trip = useLiveQuery(async () => currentOrNextVacation(await db.vacations.toArray(), T), [T]);
  // Today's day off: one marked by hand, or a chosen holiday nobody has set to work
  const todayOff = useLiveQuery(async () => {
    const h = await db.household.toCollection().first();
    const vacations = (await db.vacations.toArray()).filter((v) => !v.deletedAt);
    const log = await db.dayLogs.where('date').equals(T).first();
    const spans = offDaySpans({
      today: T,
      vacations,
      holidays: h ? holidaysOf(h) : [],
      workdays: new Set(log?.workday ? [T] : []),
    });
    return dayOffOn(T, spans) ?? null;
  }, [T, household?.holidays?.join()]);

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
  const holidays = holidaysOf(household).length;

  const saveName = () => {
    const n = name.trim();
    if (n && n !== household.name) updateHousehold({ name: n });
    else setName(household.name);
  };

  const vacationDetail = !trip
    ? "Turn on when you're away"
    : onVacation
      ? trip.endDate
        ? `On · back ${weekdayDate(addDays(trip.endDate, 1))}`
        : 'On until you turn it off'
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

      <Group title="Time away" footer="Nothing counts against you while you're away or on a day off.">
        <RowToggle
          icon="suitcase"
          title="Vacation mode"
          detail={vacationDetail}
          checked={onVacation}
          onChange={(on) => (on ? setVacationSheet(true) : endVacation(T))}
        />
        {trip && (
          <RowButton
            icon="calendar"
            title={onVacation ? 'Change return date' : 'Change vacation dates'}
            onClick={() => setVacationSheet(true)}
          />
        )}
        {trip && !onVacation && (
          <RowButton icon="close" title="Cancel planned vacation" tone="clay" onClick={() => endVacation(T)} />
        )}
        {!onVacation && (
          <RowToggle
            icon="sun"
            title="Day off today"
            detail={todayOff ? `${todayOff.label ? `${todayOff.label} · ` : ''}Nothing counts today` : 'Take today off'}
            checked={!!todayOff}
            onChange={(on) =>
              on ? takeDayOff(T) : cancelDayOff(T, !!holidayOn(T, holidaysOf(household)))
            }
          />
        )}
        <RowLink
          icon="leaf"
          title="Days off"
          detail={holidays ? `${holidays} ${holidays === 1 ? 'holiday' : 'holidays'} each year, and single days` : 'Holidays and single days'}
          to="/settings/days-off"
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
