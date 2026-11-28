import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { ActionSheet } from '../../ui/ActionSheet';
import { updateHousehold, useHousehold } from '../../data/hooks';
import { endVacation, startVacation } from '../../data/today';
import { Toggle } from '../../ui/controls';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { currentHouseholdDay } from '../../data/day';
import { exportBackup, importBackup, shareOrDownload } from '../../data/backup';
import { loadSampleRecords } from '../../data/sampleRecords';
import { loadSuggestedTasks } from '../../data/suggestedTasks';
import type { BusinessHours } from '../../data/types';
import { SharingSection, TellSomeoneSection } from './SharingSection';
import '../records/records.css';
import '../records/record-form.css';
import './settings.css';
import './plan-settings.css';

/**
 * Settings, opened from the gear on each tab.
 * Plan Settings and Seasons (Figma 16:2803, 16:2695) open from here.
 * Household name and hours have no Figma screen yet; they stand in until the setup flow exists.
 */
export function SettingsScreen() {
  const navigate = useNavigate();
  const household = useHousehold();
  const [name, setName] = useState('');
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [status, setStatus] = useState<string>();
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Vacation mode is on whenever a vacation period has no end date
  const onVacation = useLiveQuery(async () => (await db.vacations.toArray()).some((v) => !v.deletedAt && v.endDate === null)) ?? false;

  useEffect(() => {
    if (household) {
      setName(household.name);
      setHours(household.businessHours);
    }
  }, [household?.id, household?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!household || !hours) return null;

  const saveName = () => {
    const n = name.trim();
    if (n && n !== household.name) updateHousehold({ name: n });
    else setName(household.name);
  };
  const setHour = (key: keyof BusinessHours, value: string) => {
    const next = { ...hours, [key]: value };
    setHours(next);
    if (value) updateHousehold({ businessHours: next });
  };

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

      <section className="settings__group plan-settings__toggle" aria-label="Vacation mode">
        <Toggle
          title="Vacation mode"
          hint="Nothing will count against you while you're away."
          checked={onVacation}
          onChange={async (on) => (on ? startVacation(await currentHouseholdDay()) : endVacation(await currentHouseholdDay()))}
        />
      </section>

      <section className="settings__group">
        <Link to="/settings/plan" className="link-field">
          <span>Plan settings</span>
          <Icon name="chevron-right" size={18} />
        </Link>
        <p className="settings__hint">Week, month and year start, seasons, and clearing done items.</p>
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Household</h2>
        <label className="field">
          <span className="field__label">Household name</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        </label>
      </section>

      <SharingSection onStatus={setStatus} />


      <section className="settings__group">
        <h2 className="settings__heading">Business hours</h2>
        <p className="settings__hint">
          Each day starts at the open time with Opening. Closing appears an hour before close and stays until the next
          open time, so a late night still counts as that day.
        </p>
        <div className="settings__hours">
          <HourField label="Weekdays open" value={hours.weekdayOpen} onChange={(v) => setHour('weekdayOpen', v)} />
          <HourField label="Weekdays close" value={hours.weekdayClose} onChange={(v) => setHour('weekdayClose', v)} />
          <HourField label="Weekends open" value={hours.weekendOpen} onChange={(v) => setHour('weekendOpen', v)} />
          <HourField label="Weekends close" value={hours.weekendClose} onChange={(v) => setHour('weekendClose', v)} />
        </div>
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Backup</h2>
        <p className="settings__hint">
          Save a backup file now and then, for example to Files or iCloud Drive.
        </p>
        <button
          type="button"
          className="outline-button outline-button--wide"
          onClick={async () => {
            setStatus('Preparing backup…');
            try {
              await shareOrDownload(await exportBackup());
              setStatus(undefined);
            } catch {
              setStatus('The backup could not be made. Please try again.');
            }
          }}
        >
          Save a backup
        </button>
        <button type="button" className="outline-button outline-button--wide" onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </button>
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
      </section>

      <TellSomeoneSection onStatus={setStatus} />

      <section className="settings__group">
        <h2 className="settings__heading">Try it out</h2>
        <p className="settings__hint">
          Suggested tasks give you a starter plan for each part of the house. Example records (paint, filters, contacts)
          show how Records works. Nothing already on your phone is changed.
        </p>
        <button
          type="button"
          className="outline-button outline-button--wide"
          onClick={async () => {
            const n = await loadSuggestedTasks();
            setStatus(n ? `Added ${n} suggested tasks.` : 'The suggested tasks are already on your plan.');
          }}
        >
          Add suggested tasks
        </button>
        <button
          type="button"
          className="outline-button outline-button--wide"
          onClick={async () => {
            const n = await loadSampleRecords();
            setStatus(n ? `Added ${n} example records.` : 'The example records are already here.');
          }}
        >
          Add example records
        </button>
      </section>

      {status && (
        <p className="settings__status" role="status">
          {status}
        </p>
      )}

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

function HourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="text-input" type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
