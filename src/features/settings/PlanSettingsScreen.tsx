import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { Toggle } from '../../ui/controls';
import { updateHousehold, useHousehold } from '../../data/hooks';
import type { Household, Weekday } from '../../data/types';
import { MONTHS, WEEKDAYS, seasonsSummary } from '../../domain/tasks';
import '../records/record-form.css';
import '../plan/plan.css';
import './plan-settings.css';

/** Plan Settings (Figma 16:2803): how the week, month and year are counted. */
export function PlanSettingsScreen() {
  const household = useHousehold();
  if (!household) return null;
  return <PlanSettingsForm key={household.id} household={household} />;
}

function PlanSettingsForm({ household }: { household: Household }) {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState<Weekday>(household.weekStart);
  const [monthStart, setMonthStart] = useState(household.monthStart);
  const [yearStart, setYearStart] = useState(household.yearStart);
  const [clearWhenChecked, setClear] = useState(household.clearWhenChecked);

  const onSave = async () => {
    await updateHousehold({ weekStart, monthStart, yearStart, clearWhenChecked });
    goBack(navigate, '/settings');
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/settings')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Plan Settings</h1>
          <p className="pushed__subtitle">How your week, month and year are counted</p>
        </div>
      </header>

      <Select label="Week starts on" value={weekStart} onChange={(v) => setWeekStart(Number(v) as Weekday)}>
        {WEEKDAYS.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </Select>

      <Select label="Month starts on" value={monthStart} onChange={(v) => setMonthStart(Number(v))}>
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            Day {d}
          </option>
        ))}
      </Select>

      <Select label="Year starts in" value={yearStart} onChange={(v) => setYearStart(Number(v))}>
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </Select>

      <div className="field">
        <span className="field__label" id="seasons-label">
          Seasons begin
        </span>
        <Link
          to="/settings/plan/seasons"
          className="link-field"
          aria-labelledby="seasons-label seasons-value"
          // keep choices made above before leaving for the Seasons screen
          onClick={() => updateHousehold({ weekStart, monthStart, yearStart, clearWhenChecked })}
        >
          <span id="seasons-value">{seasonsSummary(household.seasonStartDates)}</span>
          <Icon name="chevron-right" size={18} />
        </Link>
      </div>

      <div className="plan-settings__toggle">
        <Toggle
          title="Clear items when checked"
          hint="Move done items out of the list"
          checked={clearWhenChecked}
          onChange={setClear}
        />
      </div>

      <div className="pushed__spacer" />
      <div className="pushed__actions">
        <button type="button" className="save-button" onClick={onSave}>
          Save
        </button>
      </div>
    </main>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <Icon name="chevron-down" size={18} />
      </span>
    </label>
  );
}
