import { useState } from 'react';
import { Sheet } from '../../ui/BottomSheet';
import { endVacation, startVacation } from '../../data/today';
import type { VacationPeriod } from '../../data/types';
import { addDays, daysBetween, weekdayDate, type Day } from '../../domain/dates';
import '../records/record-form.css';
import './vacation.css';

const QUICK = [
  { label: 'A weekend', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

/**
 * "Plan a vacation": when you leave and when you're back. It ends by itself on the day you're
 * back; "Not sure yet" lasts until "I'm back".
 */
export function VacationSheet({
  open,
  today,
  existing,
  onClose,
}: {
  open: boolean;
  today: Day;
  existing?: VacationPeriod;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="vacation-title">
      {open && <VacationForm today={today} existing={existing} onClose={onClose} />}
    </Sheet>
  );
}

function VacationForm({ today, existing, onClose }: { today: Day; existing?: VacationPeriod; onClose: () => void }) {
  const started = !!existing && existing.startDate <= today;
  const [leaving, setLeaving] = useState<Day>(existing?.startDate ?? today);
  const [back, setBack] = useState<Day>(existing?.endDate ? addDays(existing.endDate, 1) : addDays(existing?.startDate ?? today, 7));
  const [notSure, setNotSure] = useState(!!existing && existing.endDate === null);
  const valid = notSure || back > leaving;
  const away = valid && !notSure ? daysBetween(leaving, back) : null;

  const save = async () => {
    if (!valid) return;
    await startVacation(leaving, notSure ? null : addDays(back, -1));
    onClose();
  };

  return (
    <>
      <h2 id="vacation-title" className="task-sheet__title">
        {started ? 'You\u2019re on vacation' : existing ? 'Your vacation' : 'Plan a vacation'}
      </h2>
      <p className="task-sheet__meta">
        Nothing counts while you&rsquo;re away. Neatly picks back up on the day you&rsquo;re back.
      </p>

      <div className="vac-form">
        <div className="vac-form__dates">
          <label className="field">
            <span className="field__label">Leaving</span>
            <input
              className="text-input"
              type="date"
              value={leaving}
              min={started ? undefined : today}
              disabled={started}
              onChange={(e) => e.target.value && setLeaving(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Back on</span>
            <input
              className={notSure ? 'text-input is-muted' : 'text-input'}
              type="date"
              value={notSure ? '' : back}
              min={addDays(leaving, 1)}
              disabled={notSure}
              onChange={(e) => e.target.value && setBack(e.target.value)}
            />
          </label>
        </div>

        <div className="vac-form__quick" role="group" aria-label="Quick lengths">
          {QUICK.map((q) => {
            const on = !notSure && back === addDays(leaving, q.days);
            return (
              <button
                key={q.label}
                type="button"
                className={on ? 'vac-chip is-on' : 'vac-chip'}
                aria-pressed={on}
                onClick={() => {
                  setNotSure(false);
                  setBack(addDays(leaving, q.days));
                }}
              >
                {q.label}
              </button>
            );
          })}
          <button
            type="button"
            className={notSure ? 'vac-chip is-on' : 'vac-chip'}
            aria-pressed={notSure}
            onClick={() => setNotSure((n) => !n)}
          >
            Not sure yet
          </button>
        </div>

        <p className="vac-form__summary" role="status">
          {notSure
            ? 'Neatly waits until you tap I\u2019m back.'
            : !valid
              ? 'Pick a day after you leave.'
              : `${away} ${away === 1 ? 'day' : 'days'} away. Back on ${weekdayDate(back)}.`}
        </p>
      </div>

      <button type="button" className="save-button vac-form__save" disabled={!valid} onClick={save}>
        {existing ? 'Save' : leaving === today ? 'Start vacation' : 'Plan vacation'}
      </button>
      {existing && (
        <button
          type="button"
          className="task-sheet__quiet task-sheet__quiet--clay"
          onClick={async () => {
            await endVacation(today);
            onClose();
          }}
        >
          {started ? 'I\u2019m back early' : 'Cancel this vacation'}
        </button>
      )}
      <button type="button" className="task-sheet__quiet" onClick={onClose}>
        Close
      </button>
    </>
  );
}
