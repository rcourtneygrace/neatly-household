import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { updateHousehold, useHousehold } from '../../data/hooks';
import type { BusinessHours, Household } from '../../data/types';
import '../records/record-form.css';
import '../plan/plan.css';
import './settings.css';

/** Settings → Business hours: when Opening and Closing show. */
export function BusinessHoursScreen() {
  const household = useHousehold();
  if (!household) return null;
  return <HoursForm key={household.id} household={household} />;
}

function HoursForm({ household }: { household: Household }) {
  const navigate = useNavigate();
  const [hours, setHours] = useState<BusinessHours>(household.businessHours);
  const set = (key: keyof BusinessHours, value: string) => {
    const next = { ...hours, [key]: value };
    setHours(next);
    if (value) updateHousehold({ businessHours: next });
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/settings')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Business hours</h1>
          <p className="pushed__subtitle">When Opening and Closing show</p>
        </div>
      </header>

      <div className="days-off">
        <section className="settings__group" aria-labelledby="weekday-hours">
          <h2 id="weekday-hours" className="settings__heading">
            Monday to Friday
          </h2>
          <div className="settings__hours">
            <HourField label="Open" value={hours.weekdayOpen} onChange={(v) => set('weekdayOpen', v)} />
            <HourField label="Close" value={hours.weekdayClose} onChange={(v) => set('weekdayClose', v)} />
          </div>
        </section>
        <section className="settings__group" aria-labelledby="weekend-hours">
          <h2 id="weekend-hours" className="settings__heading">
            Saturday and Sunday
          </h2>
          <div className="settings__hours">
            <HourField label="Open" value={hours.weekendOpen} onChange={(v) => set('weekendOpen', v)} />
            <HourField label="Close" value={hours.weekendClose} onChange={(v) => set('weekendClose', v)} />
          </div>
        </section>
        <p className="settings__hint">
          Each day starts at the open time with Opening. Closing appears an hour before close and stays until the next
          open time, so a late night still counts as that day.
        </p>
      </div>
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
