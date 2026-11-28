import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { Toggle } from '../../ui/controls';
import { db } from '../../data/db';
import { useHouseholdDay } from '../../data/day';
import { updateHousehold, useHousehold } from '../../data/hooks';
import { cancelDayOff, takeDayOff } from '../../data/today';
import { useNow } from '../../ui/useNow';
import { addDays, toDay, weekdayDate } from '../../domain/dates';
import { HOLIDAYS, holidaysOf, nextDate } from '../../domain/holidays';
import '../records/record-form.css';
import '../plan/plan.css';
import './plan-settings.css';
import './settings.css';

/** How far back a day off can be marked: enough to fix a forgotten one, not to rewrite a month. */
const DAYS_BACK = 7;

/**
 * Settings → Days off: holidays taken off every year, and single days off (planned ahead, or
 * marked up to a week after). Nothing counts on a day off; anything due moves to the next day.
 */
export function DaysOffScreen() {
  const navigate = useNavigate();
  const household = useHousehold();
  const now = useNow();
  const T = useHouseholdDay(now) ?? toDay(now);
  const earliest = addDays(T, -DAYS_BACK);
  const days = useLiveQuery(
    async () =>
      (await db.vacations.toArray())
        .filter((v) => !v.deletedAt && v.kind === 'dayOff' && v.startDate >= earliest)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [earliest],
  );
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string>();
  if (!household || !days) return null;
  const chosen = holidaysOf(household);

  const add = async () => {
    if (!date) return;
    if (date < earliest) {
      setError(`Days off can be marked up to ${DAYS_BACK} days back.`);
      return;
    }
    setError(undefined);
    await takeDayOff(date, label.trim() || null);
    setDate('');
    setLabel('');
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/settings')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Days off</h1>
          <p className="pushed__subtitle">Nothing counts on a day off</p>
        </div>
      </header>

      <div className="days-off">
        <p className="settings__hint">
          Daily tasks, Opening and Closing aren&rsquo;t expected, and your score skips the day. Anything due that day moves
          to your next day back. A day off ends by itself at your next opening time.
        </p>

        <section className="settings__group" aria-labelledby="one-off-heading">
          <h2 id="one-off-heading" className="settings__heading">
            Add a day off
          </h2>
          <div className="days-off__add">
            <label className="field">
              <span className="field__label">Date</span>
              <span className="date-field">
                <input
                  className={date ? 'text-input' : 'text-input is-empty'}
                  type="date"
                  min={earliest}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {/* iPhone shows an empty date field as blank: give it a placeholder like the name field */}
                {!date && (
                  <span className="date-field__placeholder" aria-hidden>
                    Choose a date
                  </span>
                )}
              </span>
            </label>
            <label className="field">
              <span className="field__label">Name (optional)</span>
              <input
                className="text-input"
                value={label}
                placeholder="Family day"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          </div>
          <button type="button" className="outline-button outline-button--wide" disabled={!date} onClick={add}>
            Add day off
          </button>
          {error && (
            <p className="settings__status" role="status">
              {error}
            </p>
          )}
          {days.length > 0 && (
            <ul className="days-off__list">
              {days.map((d) => (
                <li key={d.id} className="days-off__row">
                  <span className="days-off__text">
                    <span className="days-off__date">{weekdayDate(d.startDate)}</span>
                    {d.label && <span className="days-off__label">{d.label}</span>}
                  </span>
                  <button
                    type="button"
                    className="days-off__remove"
                    onClick={() => cancelDayOff(d.startDate, false)}
                    aria-label={`Remove day off ${weekdayDate(d.startDate)}`}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="settings__hint settings__hint--small">
            You can mark a day off up to {DAYS_BACK} days back, if you forgot on the day.
          </p>
        </section>

        <section className="settings__group" aria-labelledby="holidays-heading">
          <h2 id="holidays-heading" className="settings__heading">
            Holidays every year
          </h2>
          <p className="settings__hint">Turn on the holidays your household takes off. They repeat each year.</p>
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
