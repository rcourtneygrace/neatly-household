import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../ui';
import type { Cadence, DayLog } from '../../data/types';
import type { Day } from '../../domain/dates';
import { offerRank, type TodayItem, type TodayView } from '../../domain/schedule';
import { CADENCE_LABEL } from '../../domain/tasks';
import { MetaLine, TagPill } from './rows';

const STEPS: Cadence[] = ['weekly', 'monthly', 'seasonal', 'yearly'];
const PERIOD_WORD: Record<string, string> = { weekly: 'week', monthly: 'month', seasonal: 'season', yearly: 'year' };
const FIRST_ROWS = 5;
const CARD_ROWS = 4;
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
  const [showAllCard, setShowAllCard] = useState(false);

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
  const advance = (set: Set<string>) => {
    setShowAllRows(false);
    if (isLast) finish(set);
    else setStep(nextStep);
  };
  const skip = () => {
    const n = new Set(picked);
    for (const i of current.items) n.delete(i.task.id);
    setPicked(n);
    advance(n);
  };

  if (firstStep === -1 && carried.length === 0) {
    return (
      <Shell onClose={close}>
        <p className="kicker">Build your day</p>
        <h2 id="byd-title" className="byd__title">
          Nothing to choose today
        </h2>
        <p className="byd__intro">
          Everything is either done or not due yet. Your daily tasks and anything fixed for today are on your list.
        </p>
        <div className="byd__spacer" />
        <button type="button" className="save-button" onClick={() => finish(picked)}>
          Done
        </button>
      </Shell>
    );
  }

  // "Your day so far": Already on today (locked, with a lock, no remove) then Your picks
  const lockedRows: { key: string; name: string; dept?: string }[] = [
    ...locked.map((i) => ({ key: i.task.id, name: i.task.name, dept: deptName(i.task.departmentId) })),
    ...(view.daily.length
      ? [{ key: 'daily', name: `${view.daily.length} daily ${view.daily.length === 1 ? 'task' : 'tasks'}` }]
      : []),
  ];
  const pickRows = all.filter((i) => picked.has(i.task.id));
  const pickGroups = STEPS.map((c) => ({ cadence: c, items: pickRows.filter((i) => i.task.cadence === c) })).filter(
    (g) => g.items.length > 0,
  );
  const cardTotal = lockedRows.length + pickRows.length;
  const limit = showAllCard ? Infinity : CARD_ROWS;
  const lockedShown = lockedRows.slice(0, limit);
  const shownGroups: { cadence: Cadence; total: number; items: TodayItem[] }[] = [];
  {
    let left = limit - lockedShown.length;
    for (const g of pickGroups) {
      if (left <= 0) break;
      const items = g.items.slice(0, left);
      left -= items.length;
      shownGroups.push({ cadence: g.cadence, total: g.items.length, items });
    }
  }

  const rows = showAllRows ? current.items : current.items.slice(0, FIRST_ROWS);

  return (
    <Shell onClose={close}>
      <ol className="byd__progress" aria-label={`Step ${step + 1} of 4`}>
        {STEPS.map((c, i) => (
          <li key={c} className={i <= step ? 'is-reached' : undefined} aria-current={i === step ? 'step' : undefined}>
            <span className="byd__bar" />
            <span className="byd__step-label">{CADENCE_LABEL[c]}</span>
          </li>
        ))}
      </ol>

      <p className="kicker">Build your day · Step {step + 1} of 4</p>
      <h2 id="byd-title" className="byd__title">
        Choose {CADENCE_LABEL[current.cadence]} Tasks
      </h2>
      <p className="byd__intro">
        Pick any you want to tackle today. The rest stay in your {PERIOD_WORD[current.cadence]}. Carried-over tasks are marked
        Priority.
      </p>

      <div className="byd__sofar" aria-live="polite">
        <div className="byd__sofar-head">
          <span>Your day so far</span>
          <span>{total === 1 ? '1 task' : `${total} tasks`}</span>
        </div>
        {lockedShown.length > 0 && (
          <>
            <p className="kicker byd__sofar-kicker">Already on today</p>
            {lockedShown.map((r) => (
              <div key={r.key} className="byd__sofar-row">
                <Icon name="lock" size={14} className="byd__lock" label="Fixed for today" />
                <span className="byd__sofar-name">{r.name}</span>
                {r.dept && <span className="byd__sofar-dept">{r.dept}</span>}
              </div>
            ))}
          </>
        )}
        {shownGroups.length > 0 && <p className="kicker byd__sofar-kicker">Your picks</p>}
        {shownGroups.map((g) => {
          return (
            <div key={g.cadence}>
              <p className="byd__sofar-group">
                {CADENCE_LABEL[g.cadence]} · {g.total}
              </p>
              {g.items.map((i) => (
                <div key={i.task.id} className="byd__sofar-row">
                  <span className={i.priority ? 'byd__dot is-priority' : 'byd__dot'} aria-hidden />
                  <span className="byd__sofar-name">{i.task.name}</span>
                  <span className="byd__sofar-dept">{i.carriedPick ? 'Carried over' : deptName(i.task.departmentId)}</span>
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
          );
        })}
        {!showAllCard && cardTotal > CARD_ROWS && (
          <button type="button" className="byd__showall" onClick={() => setShowAllCard(true)}>
            Show all
          </button>
        )}
      </div>

      <div className="byd__list">
        {rows.map((i) => {
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

      <div className="byd__spacer" />
      <div className="byd__actions">
        <button type="button" className="save-button" onClick={() => advance(picked)}>
          {isLast
            ? `Build my day · ${total} ${total === 1 ? 'task' : 'tasks'}`
            : `Continue to ${CADENCE_LABEL[steps[nextStep].cadence].toLowerCase()} · ${total} so far`}
        </button>
        <button type="button" className="byd__skip" onClick={skip}>
          Skip {CADENCE_LABEL[current.cadence].toLowerCase()}
        </button>
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
