import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../ui';
import type { Cadence, DayLog } from '../../data/types';
import type { Day } from '../../domain/dates';
import { offerRank, type TodayItem, type TodayView } from '../../domain/schedule';
import { CADENCE_LABEL } from '../../domain/tasks';
import { MetaLine, TagPill } from './rows';

const STEPS: Cadence[] = ['weekly', 'monthly', 'seasonal', 'yearly'];
const PERIOD_WORD: Record<string, string> = { weekly: 'week', monthly: 'month', seasonal: 'season', yearly: 'year' };
const STEP_TITLE: Record<string, string> = { weekly: 'This week', monthly: 'This month', seasonal: 'This season', yearly: 'This year' };
const FIRST_ROWS = 6;
/** After about three weeks of Build Your Day history, rank by what was picked before. */
const HISTORY_DAYS = 21;

/** Stable per-day shuffle for new users, so the order doesn't jump while the sheet is open. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rankOthers(items: TodayItem[], dayLogs: DayLog[], T: Day): TodayItem[] {
  const history = dayLogs.filter((l) => l.date < T && l.picks?.some((p) => p.kind === 'chosen'));
  if (history.length < HISTORY_DAYS) {
    return [...items].sort((a, b) => hash(T + a.task.id) - hash(T + b.task.id));
  }
  const taskPicks = new Map<string, number>();
  for (const l of history) {
    for (const p of l.picks ?? []) if (p.kind === 'chosen') taskPicks.set(p.taskId, (taskPicks.get(p.taskId) ?? 0) + 1);
  }
  const byId = new Map(items.map((i) => [i.task.id, i.task]));
  const deptPicks = new Map<string, number>();
  for (const [id, n] of taskPicks) {
    const t = byId.get(id);
    if (t) deptPicks.set(t.departmentId, (deptPicks.get(t.departmentId) ?? 0) + n);
  }
  const score = (i: TodayItem) => 3 * (taskPicks.get(i.task.id) ?? 0) + (deptPicks.get(i.task.departmentId) ?? 0);
  return [...items].sort((a, b) => score(b) - score(a) || a.task.name.localeCompare(b.task.name));
}

/**
 * Build Your Day (Figma 16:1493–16:1572, updated by the Build Your Day doc). Opens once a day
 * after Opening, and again from "Plan my day" / "Edit my day".
 */
export function BuildYourDay({
  view,
  T,
  dayLogs,
  edit,
  deptName,
  onClose,
  onDone,
}: {
  view: TodayView;
  T: Day;
  dayLogs: DayLog[];
  edit: boolean;
  deptName: (id: string) => string;
  /** applied = changes were saved (Edit my day applies on close) */
  onClose: (applied: boolean) => void;
  onDone: (picked: TodayItem[], dropped: TodayItem[]) => void;
}) {
  // Taken once when the sheet opens, so rows don't move while choosing
  const [snap] = useState(() => {
    const locked = view.inProgress.filter((i) => i.kind === 'locked');
    const currentPicks = view.inProgress.filter((i) => i.kind === 'picked' && !i.done);
    const pickedToday = currentPicks.filter((i) => !i.carriedPick);
    const steps = STEPS.map((c) => {
      const own = [...view.offers, ...pickedToday].filter((i) => i.task.cadence === c);
      const first = own.filter((i) => offerRank(i, T) < 2).sort((a, b) => offerRank(a, T) - offerRank(b, T));
      const rest = rankOthers(
        own.filter((i) => offerRank(i, T) === 2),
        dayLogs,
        T,
      );
      return { cadence: c, items: [...first, ...rest] };
    });
    return { locked, currentPicks, carried: currentPicks.filter((i) => i.carriedPick), steps };
  });
  const { locked, currentPicks, carried, steps } = snap;
  const all = useMemo(() => [...steps.flatMap((s) => s.items), ...carried], [steps, carried]);

  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set([
        ...view.offers.filter((i) => i.priority).map((i) => i.task.id), // Priority pre-checked, never forced
        ...currentPicks.map((i) => i.task.id),
      ]),
  );
  const firstStep = steps.findIndex((s) => s.items.length > 0);
  const [step, setStep] = useState(firstStep === -1 ? 0 : firstStep);
  const [showAllRows, setShowAllRows] = useState(false);
  /** The "Your day" review, opened from the count in the footer */
  const [reviewing, setReviewing] = useState(false);

  const finish = (set: Set<string>) =>
    onDone(
      all.filter((i) => set.has(i.task.id)),
      currentPicks.filter((i) => !set.has(i.task.id)),
    );
  const close = () => {
    if (edit) {
      finish(picked); // Edit my day: changes apply right away
      onClose(true);
    } else onClose(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const nextStep = steps.findIndex((s, i) => i > step && s.items.length > 0);
  const prevStep = steps.map((s, i) => (i < step && s.items.length > 0 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  const isLast = nextStep === -1;
  const current = steps[step];
  const total = locked.length + view.daily.length + picked.size;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const goTo = (i: number) => {
    setShowAllRows(false);
    setReviewing(false);
    setStep(i);
  };
  const advance = () => (isLast ? finish(picked) : goTo(nextStep));

  if (firstStep === -1 && carried.length === 0) {
    return (
      <Shell onClose={close}>
        <div className="byd__head">
          <p className="byd__step">Build your day</p>
          <h2 id="byd-title" className="byd__title">
            Nothing to choose today
          </h2>
          <p className="byd__intro">
            Everything is either done or not due yet. Your daily tasks and anything fixed for today are on your list.
          </p>
        </div>
        <div className="byd__spacer" />
        <div className="byd__footer">
          <button type="button" className="save-button byd__next" onClick={() => finish(picked)}>
            Done
          </button>
        </div>
      </Shell>
    );
  }

  // "Your day": fixed for today (with a lock) and the picks so far, opened from the footer
  const lockedRows: { key: string; name: string; meta?: string }[] = [
    ...locked.map((i) => ({ key: i.task.id, name: i.task.name, meta: deptName(i.task.departmentId) })),
    ...(view.daily.length
      ? [{ key: 'daily', name: `${view.daily.length} daily ${view.daily.length === 1 ? 'task' : 'tasks'}`, meta: 'Every day' }]
      : []),
  ];
  const pickRows = all.filter((i) => picked.has(i.task.id));
  const rows = showAllRows ? current.items : current.items.slice(0, FIRST_ROWS);
  const hasPriority = current.items.some((i) => i.priority);

  return (
    <Shell onClose={close}>
      <div className="byd__head">
        <div className="byd__progress" role="progressbar" aria-label="Build your day" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of 4, ${CADENCE_LABEL[current.cadence]}`}>
          {STEPS.map((c, i) => (
            <span key={c} className={i <= step ? 'byd__bar is-reached' : 'byd__bar'} />
          ))}
        </div>
        {reviewing ? (
          <>
            <h2 id="byd-title" className="byd__title">
              Your day
            </h2>
            <p className="byd__intro">
              {total} {total === 1 ? 'task' : 'tasks'} on today. Tap ✕ to take a pick off.
            </p>
          </>
        ) : (
          <>
            <p className="byd__step">
              Step {step + 1} of 4 · {CADENCE_LABEL[current.cadence]}
            </p>
            <h2 id="byd-title" className="byd__title">
              {STEP_TITLE[current.cadence]}
            </h2>
            <p className="byd__intro">
              Pick what you&rsquo;d like to do today. The rest stay for later this {PERIOD_WORD[current.cadence]}.
              {hasPriority && ' Priority tasks were missed last time.'}
            </p>
          </>
        )}
      </div>

      <div className="byd__body">
        {reviewing ? (
          <div className="byd__review" aria-live="polite">
            {lockedRows.length > 0 && <p className="byd__group">Already on today</p>}
            {lockedRows.map((r) => (
              <div key={r.key} className="byd__review-row">
                <Icon name="lock" size={16} className="byd__lock" label="Fixed for today" />
                <span className="byd__review-text">
                  <span className="byd__review-name">{r.name}</span>
                  {r.meta && <span className="byd__review-meta">{r.meta}</span>}
                </span>
              </div>
            ))}
            {pickRows.length > 0 && <p className="byd__group">Your picks</p>}
            {pickRows.map((i) => (
              <div key={i.task.id} className="byd__review-row">
                <span className={i.priority ? 'byd__dot is-priority' : 'byd__dot'} aria-hidden />
                <span className="byd__review-text">
                  <span className="byd__review-name">{i.task.name}</span>
                  <span className="byd__review-meta">
                    {i.carriedPick ? 'Carried over' : `${deptName(i.task.departmentId)} · ${CADENCE_LABEL[i.task.cadence]}`}
                  </span>
                </span>
                <button type="button" className="byd__remove" aria-label={`Remove ${i.task.name}`} onClick={() => toggle(i.task.id)}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
            {pickRows.length === 0 && <p className="byd__empty">No picks yet. Daily tasks and fixed tasks are already on.</p>}
          </div>
        ) : (
          <div className="byd__list">
            {rows.map((i) => {
              const on = picked.has(i.task.id);
              return (
                <button
                  key={i.task.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={`byd__row${on ? ' is-on' : ''}`}
                  onClick={() => toggle(i.task.id)}
                >
                  <span className="byd__box" aria-hidden>
                    {on && <Icon name="check" size={16} />}
                  </span>
                  <span className="row-text">
                    <span className="row-text__name">{i.task.name}</span>
                    <MetaLine item={i} department={deptName(i.task.departmentId)} T={T} />
                  </span>
                  <TagPill tag={i.kind === 'offer' ? i.tag : i.priority ? 'priority' : null} />
                </button>
              );
            })}
            {!showAllRows && current.items.length > FIRST_ROWS && (
              <button type="button" className="byd__showall" onClick={() => setShowAllRows(true)}>
                Show {current.items.length - FIRST_ROWS} more
              </button>
            )}
          </div>
        )}
      </div>

      <div className="byd__footer">
        <button
          type="button"
          className="byd__count"
          aria-expanded={reviewing}
          onClick={() => setReviewing((r) => !r)}
        >
          <span>
            <strong>{total}</strong> on today
          </span>
          <Icon name={reviewing ? 'chevron-down' : 'chevron-up'} size={18} />
        </button>
        <div className="byd__nav">
          {reviewing ? (
            <button type="button" className="byd__back" onClick={() => setReviewing(false)}>
              Back
            </button>
          ) : (
            prevStep !== -1 && (
              <button type="button" className="byd__back" onClick={() => goTo(prevStep)}>
                Back
              </button>
            )
          )}
          <button type="button" className="save-button byd__next" onClick={advance}>
            {isLast ? 'Build my day' : `Next: ${CADENCE_LABEL[steps[nextStep].cadence]}`}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="byd" role="dialog" aria-modal="true" aria-labelledby="byd-title" onClick={onClose}>
      <div className="byd__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="byd__top">
          <div className="sheet__handle" aria-hidden />
          <button type="button" className="byd__x" onClick={onClose}>
            <Icon name="close" size={20} label="Close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
