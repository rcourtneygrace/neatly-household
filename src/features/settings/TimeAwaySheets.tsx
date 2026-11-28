import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../../ui';
import { Sheet } from '../../ui/BottomSheet';
import { db } from '../../data/db';
import { cancelDayOff, takeDayOff } from '../../data/today';
import { addDays, weekdayDate, type Day } from '../../domain/dates';
import { DAY_OFF_REASONS, dayOffMessage } from '../../domain/holidays';
import '../records/record-form.css';
import './vacation.css';
import './settings.css';

type Reason = (typeof DAY_OFF_REASONS)[number]['label'];

/** How far back a day off can be marked: enough to fix a forgotten one, not to rewrite a month. */
export const DAYS_BACK = 7;

/** "Take today off?": one tap on a reason, one tap to confirm. Nothing to type. */
export function TakeTodayOffSheet({
  open,
  today,
  off,
  onClose,
}: {
  open: boolean;
  today: Day;
  /** Today's day off, if it already is one */
  off: { label: string | null; yearly: boolean } | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const close = () => {
    setReason(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} labelledBy="today-off-title">
      {off ? (
        <>
          <h2 id="today-off-title" className="task-sheet__title">
            {dayOffMessage(off.label, off.yearly)}
          </h2>
          <p className="task-sheet__meta">
            Today is a day off. Nothing counts, and anything due will be waiting when you&rsquo;re back.
          </p>
          <button
            type="button"
            className="save-button vac-form__save"
            onClick={async () => {
              await cancelDayOff(today, off.yearly);
              close();
            }}
          >
            Back to work
          </button>
          <button type="button" className="task-sheet__quiet" onClick={close}>
            Close
          </button>
        </>
      ) : (
        <>
          <h2 id="today-off-title" className="task-sheet__title">
            Take today off?
          </h2>
          <p className="task-sheet__meta">
            Nothing counts today. Anything due will be waiting when you&rsquo;re back, so you won&rsquo;t fall behind.
          </p>
          <ReasonPicker value={reason} onChange={setReason} />
          <button
            type="button"
            className="save-button vac-form__save"
            onClick={async () => {
              await takeDayOff(today, reason);
              close();
            }}
          >
            Take today off
          </button>
          <button type="button" className="task-sheet__quiet" onClick={close}>
            Not now
          </button>
        </>
      )}
    </Sheet>
  );
}

/** The three quick reasons. Optional: tap again to clear. */
function ReasonPicker({ value, onChange }: { value: Reason | null; onChange: (r: Reason | null) => void }) {
  return (
    <div className="dayoff-reasons" role="group" aria-label="What kind of day? (optional)">
      {DAY_OFF_REASONS.map((r) => {
        const on = value === r.label;
        return (
          <button
            key={r.label}
            type="button"
            className={on ? 'dayoff-reason is-on' : 'dayoff-reason'}
            aria-pressed={on}
            onClick={() => onChange(on ? null : r.label)}
          >
            <span className="dayoff-reason__icon" aria-hidden>
              <Icon name={r.icon} size={18} />
            </span>
            <span className="dayoff-reason__label">{r.label}</span>
            <span className="dayoff-reason__check" aria-hidden>
              {on && <Icon name="check" size={16} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Plan days off": single days ahead (or up to a week back), and the way into yearly days. */
export function PlanDaysOffSheet({
  open,
  today,
  yearlyCount,
  onClose,
}: {
  open: boolean;
  today: Day;
  yearlyCount: number;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="plan-off-title">
      {open && <PlanDaysOff today={today} yearlyCount={yearlyCount} onClose={onClose} />}
    </Sheet>
  );
}

function PlanDaysOff({ today, yearlyCount, onClose }: { today: Day; yearlyCount: number; onClose: () => void }) {
  const navigate = useNavigate();
  const earliest = addDays(today, -DAYS_BACK);
  const days = useLiveQuery(
    async () =>
      (await db.vacations.toArray())
        .filter((v) => !v.deletedAt && v.kind === 'dayOff' && v.startDate >= earliest)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [earliest],
  );
  const [date, setDate] = useState('');
  const [reason, setReason] = useState<Reason | null>(null);

  const add = async () => {
    if (!date || date < earliest) return;
    await takeDayOff(date, reason);
    setDate('');
    setReason(null);
  };

  return (
    <>
      <h2 id="plan-off-title" className="task-sheet__title">
        Plan days off
      </h2>
      <p className="task-sheet__meta">Nothing counts on a day off. Anything due waits for your next day back.</p>

      <div className="dayoff-plan">
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
            {!date && (
              <span className="date-field__placeholder" aria-hidden>
                Choose a date
              </span>
            )}
          </span>
        </label>
        <ReasonPicker value={reason} onChange={setReason} />
        <button type="button" className="outline-button outline-button--wide" disabled={!date} onClick={add}>
          Add day off
        </button>

        {!!days?.length && (
          <ul className="days-off__list" aria-label="Days off">
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

        <button
          type="button"
          className="dayoff-yearly"
          onClick={() => {
            onClose();
            navigate('/settings/days-off');
          }}
        >
          <span className="dayoff-reason__icon" aria-hidden>
            <Icon name="calendar" size={18} />
          </span>
          <span className="days-off__text">
            <span className="days-off__date">Every year</span>
            <span className="days-off__label">
              Holidays and birthdays{yearlyCount ? ` · ${yearlyCount} ${yearlyCount === 1 ? 'day' : 'days'}` : ''}
            </span>
          </span>
          <Icon name="chevron-right" size={18} className="set-row__chevron" />
        </button>
      </div>

      <button type="button" className="task-sheet__quiet" onClick={onClose}>
        Done
      </button>
    </>
  );
}
