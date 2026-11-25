import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui';
import type { Cadence } from '../../data/types';
import type { Day } from '../../domain/dates';
import { buildCandidates, type TodayItem, type TodayView } from '../../domain/schedule';
import { CADENCE_LABEL } from '../../domain/tasks';
import { MetaLine, TagPill } from './rows';

const STEP_CADENCES: Cadence[] = ['weekly', 'monthly', 'seasonal', 'yearly'];
const PERIOD_WORD: Record<string, string> = { weekly: 'week', monthly: 'month', seasonal: 'season', yearly: 'year' };

/**
 * Build Your Day (Figma 16:1493, 16:1275, 16:1384, 16:1572): after Opening, walk through the
 * weekly, monthly, seasonal and yearly tasks and pick what to tackle today. Steps with nothing
 * waiting are left out. Picked tasks get the Today tag and move to the top of In Progress.
 */
export function BuildYourDay({
  view,
  T,
  deptName,
  onClose,
  onDone,
}: {
  view: TodayView;
  T: Day;
  deptName: (id: string) => string;
  onClose: () => void;
  onDone: (picked: TodayItem[], dropped: TodayItem[]) => void;
}) {
  const candidates = useMemo(() => buildCandidates(view), [view]);
  const steps = useMemo(
    () =>
      STEP_CADENCES.map((c) => ({ cadence: c, items: candidates.filter((i) => i.task.cadence === c) })).filter(
        (s) => s.items.length > 0,
      ),
    [candidates],
  );
  // Start with what is already planned or due today
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(candidates.filter((i) => i.planned || i.tag === 'today').map((i) => i.task.id)),
  );
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (steps.length === 0) return null;
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const word = PERIOD_WORD[current.cadence];

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const finish = (set: Set<string>) => {
    onDone(
      candidates.filter((i) => set.has(i.task.id)),
      candidates.filter((i) => i.planned && !set.has(i.task.id)),
    );
  };
  const next = (set: Set<string>) => (isLast ? finish(set) : setStep(step + 1));
  const skip = () => {
    const n = new Set(picked);
    for (const i of current.items) n.delete(i.task.id);
    setPicked(n);
    next(n);
  };

  const earlier = steps.slice(0, step).map((s) => ({ ...s, items: s.items.filter((i) => picked.has(i.task.id)) }));
  const soFar = earlier.reduce((n, s) => n + s.items.length, 0);
  const total = picked.size;

  return (
    <div className="byd" role="dialog" aria-modal="true" aria-labelledby="byd-title">
      <div className="byd__sheet">
        <div className="sheet__handle" aria-hidden />
        <ol className="byd__progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <li key={s.cadence} className={i <= step ? 'is-reached' : undefined} aria-current={i === step ? 'step' : undefined}>
              <span className="byd__bar" />
              <span className="byd__step-label">{CADENCE_LABEL[s.cadence]}</span>
            </li>
          ))}
        </ol>

        <p className="kicker">
          Build your day · Step {step + 1} of {steps.length}
        </p>
        <h2 id="byd-title" className="byd__title">
          Choose {CADENCE_LABEL[current.cadence]} Tasks
        </h2>
        <p className="byd__intro">
          Pick any you want to tackle today. The rest stay in your {word}. Carried-over tasks are marked Priority.
        </p>

        {soFar > 0 && (
          <div className="byd__sofar">
            <div className="byd__sofar-head">
              <span>Your day so far</span>
              <span>{soFar === 1 ? '1 task' : `${soFar} tasks`}</span>
            </div>
            {earlier
              .filter((s) => s.items.length > 0)
              .map((s) => (
                <div key={s.cadence}>
                  <p className="kicker byd__sofar-kicker">
                    {CADENCE_LABEL[s.cadence]} · {s.items.length}
                  </p>
                  {s.items.map((i) => (
                    <div key={i.task.id} className="byd__sofar-row">
                      <span className={i.priority ? 'byd__dot is-priority' : 'byd__dot'} aria-hidden />
                      <span className="byd__sofar-name">{i.task.name}</span>
                      <span className="byd__sofar-dept">{deptName(i.task.departmentId)}</span>
                      <button
                        type="button"
                        className="byd__remove"
                        aria-label={`Remove ${i.task.name}`}
                        onClick={() => toggle(i.task.id)}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        <div className="byd__list">
          {current.items.map((i) => {
            const on = picked.has(i.task.id);
            return (
              <button
                key={i.task.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`byd__row${on ? ' is-on' : ''}${i.priority && !on ? ' is-priority' : ''}`}
                onClick={() => toggle(i.task.id)}
              >
                <span className="byd__box" aria-hidden>
                  {on && <Icon name="check" size={14} />}
                </span>
                <span className="row-text">
                  <span className="row-text__name">{i.task.name}</span>
                  <MetaLine item={i} department={deptName(i.task.departmentId)} T={T} />
                </span>
                <TagPill tag={i.tag} />
              </button>
            );
          })}
        </div>

        <div className="byd__spacer" />
        <div className="byd__actions">
          <button type="button" className="save-button" onClick={() => next(picked)}>
            {isLast
              ? `Build my day · ${total} ${total === 1 ? 'task' : 'tasks'}`
              : `Continue to ${CADENCE_LABEL[steps[step + 1].cadence].toLowerCase()} · ${total} so far`}
          </button>
          <button type="button" className="byd__skip" onClick={skip}>
            Skip {CADENCE_LABEL[current.cadence].toLowerCase()}
          </button>
          <button type="button" className="byd__close" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
