import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { Toggle } from '../../ui/controls';
import { newId } from '../../data/db';
import { useHouseholdDay } from '../../data/day';
import { updateHousehold, useHousehold } from '../../data/hooks';
import { useNow } from '../../ui/useNow';
import { toDay, weekdayDate } from '../../domain/dates';
import { HOLIDAYS, holidaysOf, nextDate, ownHoliday } from '../../domain/holidays';
import '../records/record-form.css';
import '../plan/plan.css';
import './plan-settings.css';
import './settings.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Settings → Plan days off → Every year: the household's own days (birthdays and the like)
 * and common holidays. Each one is a day off every year.
 */
export function DaysOffScreen() {
  const navigate = useNavigate();
  const household = useHousehold();
  const now = useNow();
  const T = useHouseholdDay(now) ?? toDay(now);
  const [name, setName] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState(now.getDate());
  if (!household) return null;
  const chosen = holidaysOf(household);
  const own = household.yearlyDays ?? [];

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await updateHousehold({ yearlyDays: [...own, { id: newId(), name: n, month, day }] });
    setName('');
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/settings')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Every year</h1>
          <p className="pushed__subtitle">Days off that come back each year</p>
        </div>
      </header>

      <div className="days-off">
        <section className="settings__group" aria-labelledby="own-heading">
          <h2 id="own-heading" className="settings__heading">
            Your own days
          </h2>
          <p className="settings__hint">Birthdays, anniversaries, or any day your household always takes off.</p>
          {own.length > 0 && (
            <ul className="days-off__list">
              {own.map((d) => (
                <li key={d.id} className="days-off__row">
                  <span className="days-off__text">
                    <span className="days-off__date">{d.name}</span>
                    <span className="days-off__label">Next: {weekdayDate(nextDate(ownHoliday(d), T))}</span>
                  </span>
                  <button
                    type="button"
                    className="days-off__remove"
                    onClick={() => updateHousehold({ yearlyDays: own.filter((x) => x.id !== d.id) })}
                    aria-label={`Remove ${d.name}`}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="text-input"
              value={name}
              placeholder="My birthday"
              onChange={(e) => setName(e.target.value)}
              enterKeyHint="done"
            />
          </label>
          <div className="days-off__add">
            <label className="field">
              <span className="field__label">Month</span>
              <select className="text-input" value={month} onChange={(e) => {
                  const m = Number(e.target.value);
                  setMonth(m);
                  setDay((d) => Math.min(d, new Date(2024, m + 1, 0).getDate()));
                }}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Day</span>
              <select className="text-input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {Array.from({ length: new Date(2024, month + 1, 0).getDate() }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="outline-button outline-button--wide" disabled={!name.trim()} onClick={add}>
            Add to every year
          </button>
        </section>

        <section className="settings__group" aria-labelledby="holidays-heading">
          <h2 id="holidays-heading" className="settings__heading">
            Holidays
          </h2>
          <p className="settings__hint">Turn on the holidays your household takes off.</p>
          {HOLIDAYS.map((h) => (
            <Toggle
              key={h.id}
              title={h.name}
              hint={weekdayDate(nextDate(h, T))}
              checked={chosen.includes(h.id)}
              onChange={(on) =>
                updateHousehold({ holidays: on ? [...chosen, h.id] : chosen.filter((id) => id !== h.id) })
              }
            />
          ))}
        </section>
      </div>
    </main>
  );
}
