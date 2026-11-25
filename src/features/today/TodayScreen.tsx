import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Wordmark } from '../../ui';
import { useNow } from '../../ui/useNow';
import {
  buildDay,
  completeClosing,
  completeOpening,
  dismissBuildDay,
  dismissWelcomeBack,
  endVacation,
  reopenDay,
  setDone,
  skipItem,
  undo,
  useTodayData,
  type TodayData,
  type UndoSnapshot,
} from '../../data/today';
import type { RoutineTemplate } from '../../data/types';
import { addDays, clockTime, hhmmLabel, longDate, minutesOf, toDay, weekdayOf, type Day } from '../../domain/dates';
import { buildToday, inVacation, plainMeta, type TodayItem, type TodayView } from '../../domain/schedule';
import { BuildYourDay } from './BuildYourDay';
import { SkipSheet, TaskActionsSheet } from './TaskActionsSheet';
import { MetaLine, TagPill } from './rows';
import './today.css';
import './task-sheet.css';

/** Closing shows this long before the close time (Settings → Business hours). */
const CLOSING_LEAD_MINUTES = 60;

/** Today (Figma 16:2014 opening, 16:2187 daily complete, 16:1694 evening, 5:2 / 5:88 after hours). */
export function TodayScreen() {
  const now = useNow();
  const T = toDay(now);
  const data = useTodayData(T);
  if (!data) return <main className="screen" />;
  return <Today data={data} now={now} T={T} />;
}

function hoursFor(day: Day, data: TodayData) {
  const h = data.household.businessHours;
  const weekend = [0, 6].includes(weekdayOf(day));
  return weekend ? { open: h.weekendOpen, close: h.weekendClose } : { open: h.weekdayOpen, close: h.weekdayClose };
}

function useTodayView(data: TodayData, T: Day): { view: TodayView; openedDays: Set<Day> } {
  const openedDays = useMemo(
    () => new Set(data.dayLogs.filter((l) => l.openingStatus === 'done').map((l) => l.date)),
    [data.dayLogs],
  );
  const { household } = data;
  const view = useMemo(
    () =>
      buildToday({
        today: T,
        tasks: data.tasks,
        occurrences: data.occurrences,
        cal: household,
        clearWhenChecked: household.clearWhenChecked,
        openedDays,
        vacations: data.vacations,
      }),
    [T, data.tasks, data.occurrences, household, openedDays, data.vacations],
  );
  return { view, openedDays };
}

function Today({ data, now, T }: { data: TodayData; now: Date; T: Day }) {
  const navigate = useNavigate();
  const { household } = data;
  const [building, setBuilding] = useState(false);
  const [actionsFor, setActionsFor] = useState<TodayItem | null>(null);
  const [skipFor, setSkipFor] = useState<TodayItem | null>(null);
  const [toast, setToast] = useState<{ text: string; snap: UndoSnapshot } | null>(null);
  const { view, openedDays } = useTodayView(data, T);
  const dept = useMemo(() => new Map(data.departments.map((d) => [d.id, d.name])), [data.departments]);
  const deptName = (id: string) => dept.get(id) ?? '';

  const log = data.dayLogs.find((l) => l.date === T);
  const opened = log?.openingStatus === 'done';
  const closed = log?.closingStatus === 'done';
  const hours = hoursFor(T, data);
  const closingTime = minutesOf(hours.close) - CLOSING_LEAD_MINUTES;
  const showClosing = minutesOf(now) >= closingTime;
  const away = inVacation(T, data.vacations, T) && data.vacations.some((v) => v.endDate === null);
  const welcome = !away ? data.vacations.find((v) => v.endDate !== null && !v.welcomeSeen) : undefined;

  const onMarkOpening = async () => {
    await completeOpening(T);
    // Build Your Day opens once a day, right after Opening (never on vacation)
    if (!log?.dayBuilt && !log?.dayDismissed) setBuilding(true);
  };
  const onMarkClosing = async () => {
    const all = [...view.daily, ...view.inProgress];
    await completeClosing(T, { planned: all.length, completed: all.filter((i) => i.done).length });
  };
  const onSkip = async (item: TodayItem, reason: string | null) => {
    const snap = await skipItem(item, reason);
    setToast({ text: `Skipped ${item.task.name}.`, snap });
  };

  if (away) {
    return (
      <main className="screen today">
        <TodayHeader name={household.name} now={now} onSettings={() => navigate('/settings')} />
        <div className="today__body">
          <section className="away-card" aria-labelledby="away-title">
            <span className="closed-hero__badge" aria-hidden>
              <Icon name="sun" size={24} />
            </span>
            <h2 id="away-title" className="closed-hero__title">
              Out of office
            </h2>
            <p className="closed-hero__sub">Nothing will count against you while you&rsquo;re away.</p>
            <button type="button" className="outline-button outline-button--wide" onClick={() => endVacation(T)}>
              Turn off vacation mode
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="screen today">
      <TodayHeader name={household.name} now={now} onSettings={() => navigate('/settings')} />

      {welcome && (
        <div className="today__body today__body--top">
          <div className="welcome-card" role="status">
            <p>Welcome back. Start with Opening when you&rsquo;re ready.</p>
            <button type="button" className="welcome-card__close" onClick={() => dismissWelcomeBack(welcome.id)}>
              <Icon name="close" size={18} label="Dismiss" />
            </button>
          </div>
        </div>
      )}

      {closed ? (
        <ClosedView data={data} view={view} T={T} openedDays={openedDays} deptName={deptName} />
      ) : (
        <div className="today__body">
          {!opened && !showClosing && (
            <RoutineCard routine={data.routines.opening} type="opening" onComplete={onMarkOpening} />
          )}
          {opened && <OpenedBanner at={log?.openingAt} />}
          {showClosing && <RoutineCard routine={data.routines.closing} type="closing" onComplete={onMarkClosing} />}

          {view.daily.length > 0 && (
            <DailySection items={view.daily} deptName={deptName} T={T} onMore={(i) => setActionsFor(i)} />
          )}

          <section className="today-section" aria-labelledby="in-progress">
            <div className="today-section__head today-section__head--stack">
              <p className="kicker">Weekly · Monthly · Seasonally · Yearly</p>
              <div className="today-section__row">
                <h2 id="in-progress" className="today-section__title">
                  In Progress
                </h2>
                {opened && (
                  <button type="button" className="today-section__action" onClick={() => setBuilding(true)}>
                    {log?.dayBuilt ? 'Edit my day' : 'Plan my day'}
                  </button>
                )}
              </div>
            </div>
            <div className="today-card">
              {view.inProgress.length === 0 ? (
                <p className="today-card__empty">
                  {data.tasks.length === 0 ? (
                    <>
                      Nothing here yet. <Link to="/plan">Add tasks in Plan</Link>.
                    </>
                  ) : !opened ? (
                    'Nothing fixed for today. After Opening, you can pick what to do.'
                  ) : log?.dayBuilt ? (
                    'All clear for today.'
                  ) : (
                    'Nothing on your list yet. Plan my day to pick a few.'
                  )}
                </p>
              ) : (
                view.inProgress.map((item) => (
                  <TaskCheckRow
                    key={item.task.id}
                    item={item}
                    department={deptName(item.task.departmentId)}
                    T={T}
                    onMore={() => setActionsFor(item)}
                  />
                ))
              )}
            </div>
          </section>

          {view.comingSoon.length > 0 && (
            <section className="today-section" aria-labelledby="coming-soon">
              <div className="today-section__head">
                <div>
                  <p className="kicker">Preview</p>
                  <h2 id="coming-soon" className="today-section__title">
                    Coming Soon
                  </h2>
                </div>
              </div>
              <div className="today-card">
                {view.comingSoon.map((g) => (
                  <div key={g.label} className="soon-group">
                    <p className="soon-group__label">{g.label}</p>
                    {g.items.map((i) => (
                      <div key={i.task.id} className="soon-row">
                        <div className="row-text">
                          <span className="row-text__name row-text__name--soft">{i.task.name}</span>
                          <span className="row-text__meta">{plainMeta(i.task, deptName(i.task.departmentId))}</span>
                        </div>
                        <span className="pill">{i.pill}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {building && (
        <BuildYourDay
          view={view}
          T={T}
          dayLogs={data.dayLogs}
          edit={!!log?.dayBuilt}
          deptName={deptName}
          onClose={async (applied) => {
            setBuilding(false);
            if (!applied && !log?.dayBuilt) await dismissBuildDay(T);
          }}
          onDone={async (picked, dropped) => {
            await buildDay(T, picked, dropped, view.inProgress.filter((i) => i.kind === 'locked'));
            setBuilding(false);
          }}
        />
      )}

      <TaskActionsSheet
        item={actionsFor}
        department={actionsFor ? deptName(actionsFor.task.departmentId) : ''}
        onClose={() => setActionsFor(null)}
        onPush={(i) => navigate(`/today/push/${i.task.id}`)}
        onSkip={(i) => setSkipFor(i)}
        onEdit={(i) => navigate(`/plan/tasks/${i.task.id}`)}
      />
      <SkipSheet item={skipFor} onClose={() => setSkipFor(null)} onSkip={onSkip} />
      {toast && <UndoToast text={toast.text} onUndo={() => undo(toast.snap)} onDone={() => setToast(null)} />}
    </main>
  );
}

/** "Skipped <task>. Undo" for about 5 seconds. */
function UndoToast({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), 5000);
    return () => window.clearTimeout(id);
  }, [text]);
  return (
    <div className="undo-toast" role="status">
      <span>{text}</span>
      <button
        type="button"
        onClick={() => {
          onUndo();
          onDone();
        }}
      >
        Undo
      </button>
    </div>
  );
}

/* ---------- Header (Figma 16:2019) ---------- */

function TodayHeader({ name, now, onSettings }: { name: string; now: Date; onSettings: () => void }) {
  return (
    <header>
      <Wordmark />
      <div className="today-header">
        <span className="today-header__avatar" aria-hidden>
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 className="today-header__name">{name}</h1>
        <button type="button" className="today-header__settings" onClick={onSettings}>
          <Icon name="sliders" size={20} label="Settings" />
        </button>
      </div>
      <p className="today-header__date">
        {longDate(now)} · {clockTime(now)}
      </p>
    </header>
  );
}

/* ---------- Opening / Closing (Figma 16:2031) ---------- */

function RoutineCard({
  routine,
  type,
  onComplete,
}: {
  routine?: RoutineTemplate;
  type: 'opening' | 'closing';
  onComplete: () => void;
}) {
  const title = type === 'opening' ? 'Opening' : 'Closing';
  const steps = [...(routine?.steps ?? [])].sort((a, b) => a.order - b.order);
  return (
    <section className="routine" aria-labelledby={`routine-${type}`}>
      <div className="routine__head">
        <span className="routine__icon">
          <Icon name={type === 'opening' ? 'sun' : 'moon'} size={22} />
        </span>
        <h2 id={`routine-${type}`} className="routine__title">
          {title}
        </h2>
      </div>
      {steps.length > 0 ? (
        <ul className="routine__steps">
          {steps.map((s) => (
            <li key={s.order}>{s.text}</li>
          ))}
        </ul>
      ) : (
        <p className="routine__empty">
          No steps yet. <Link to={`/plan/routine/${type}`}>Add steps in Plan</Link>.
        </p>
      )}
      <button type="button" className="routine__complete" onClick={onComplete}>
        <span className="routine__box" aria-hidden />
        Mark {type} complete
      </button>
    </section>
  );
}

function OpenedBanner({ at }: { at?: string | null }) {
  return (
    <div className="opened-banner">
      <span className="opened-banner__icon">
        <Icon name="sun" size={22} />
      </span>
      <div className="opened-banner__text">
        <p className="opened-banner__title">Household opened</p>
        {at && <p className="opened-banner__sub">Checked in at {clockTime(new Date(at))}</p>}
      </div>
      <Icon name="check" size={22} />
    </div>
  );
}

/* ---------- Task rows ---------- */

function CheckButton({ item }: { item: TodayItem }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={item.task.name}
      className={item.done ? 'check is-done' : 'check'}
      onClick={() => setDone(item, !item.done)}
    >
      {item.done && <Icon name="check" size={14} />}
    </button>
  );
}

function TaskCheckRow({
  item,
  department,
  T,
  onMore,
}: {
  item: TodayItem;
  department: string;
  T: Day;
  onMore?: () => void;
}) {
  return (
    <div className={item.priority ? 'task-check is-priority' : 'task-check'}>
      <CheckButton item={item} />
      <button type="button" className="row-text row-text--button" onClick={onMore} disabled={!onMore || item.done}>
        <span className={item.done ? 'row-text__name is-done' : 'row-text__name'}>{item.task.name}</span>
        {item.done ? (
          <span className="row-text__meta">{plainMeta(item.task, department)}</span>
        ) : (
          <MetaLine item={item} department={department} T={T} />
        )}
      </button>
      <TagPill tag={item.tag} />
    </div>
  );
}

/* ---------- Daily Tasks (Figma 16:2059, collapsed 16:2221) ---------- */

function DailySection({
  items,
  deptName,
  T,
  onMore,
}: {
  items: TodayItem[];
  deptName: (id: string) => string;
  T: Day;
  onMore: (i: TodayItem) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  return (
    <section className="today-section" aria-labelledby="daily">
      <div className="today-section__head">
        <div>
          <p className="kicker">Every day</p>
          <h2 id="daily" className="today-section__title">
            Daily Tasks
          </h2>
        </div>
      </div>
      {allDone && !showDone ? (
        <div className="success-row">
          <span className="success-row__check">
            <Icon name="check" size={14} />
          </span>
          <div className="success-row__text">
            <p className="success-row__title">Daily tasks complete</p>
            <p className="success-row__sub">
              {doneCount} of {items.length} done
            </p>
          </div>
          <button type="button" className="success-row__button" onClick={() => setShowDone(true)}>
            View done
          </button>
        </div>
      ) : (
        <div className="today-card">
          {items.map((item) => (
            <TaskCheckRow
              key={item.task.id}
              item={item}
              department={deptName(item.task.departmentId)}
              T={T}
              onMore={() => onMore(item)}
            />
          ))}
          {allDone && (
            <button type="button" className="today-card__more" onClick={() => setShowDone(false)}>
              Hide done
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- After hours (Figma 5:2, 5:88) ---------- */

function ClosedView({
  data,
  view,
  T,
  openedDays,
  deptName,
}: {
  data: TodayData;
  view: TodayView;
  T: Day;
  openedDays: Set<Day>;
  deptName: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const log = data.dayLogs.find((l) => l.date === T);
  const tomorrow = addDays(T, 1);
  const tomorrowHours = hoursFor(tomorrow, data);

  const dailyDone = view.daily.filter((i) => i.done);
  const progressDone = view.inProgress.filter((i) => i.done);
  const finished = dailyDone.length + progressDone.length;
  const carry = view.inProgress.filter((i) => !i.done);

  // Tomorrow as it will look if nothing else is checked off tonight
  const next = buildToday({
    today: tomorrow,
    tasks: data.tasks,
    occurrences: data.occurrences,
    cal: data.household,
    clearWhenChecked: true,
    openedDays: new Set([...openedDays, T]),
    vacations: data.vacations,
  });
  const priorityTomorrow = [...next.inProgress, ...next.offers].filter((i) => i.priority).length;
  const carryPriority = carry.filter((i) => i.priority).length;

  return (
    <div className="today__body">
      <p className="status-pill">
        <span className="status-pill__dot" aria-hidden />
        Closed · opens at {hhmmLabel(tomorrowHours.open)}
      </p>

      <div className="closed-hero">
        <span className="closed-hero__badge">
          <Icon name="check-large" size={26} />
        </span>
        <p className="closed-hero__title">Closed for the day. Well run.</p>
        {log?.closingAt && <p className="closed-hero__sub">Closing finished at {clockTime(new Date(log.closingAt))}</p>}
        <button type="button" className="closed-hero__reopen" onClick={() => reopenDay(T)}>
          Reopen today
        </button>
      </div>

      {finished > 0 ? (
        <div className="done-day">
          <button type="button" className="done-day__bar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="success-row__check success-row__check--lg">
              <Icon name="check" size={14} />
            </span>
            <span className="success-row__text">
              <span className="success-row__title done-day__title">Done for the day</span>
              <span className="success-row__sub">
                {finished} {finished === 1 ? 'task' : 'tasks'} finished · tap to {open ? 'close' : 'review'}
              </span>
            </span>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} />
          </button>
          {open && (
            <div className="done-day__panel">
              {view.daily.length > 0 && (
                <>
                  <p className="soon-group__label">
                    Daily tasks · {dailyDone.length} of {view.daily.length} done
                  </p>
                  {dailyDone.map((i) => (
                    <DoneRow key={i.task.id} name={i.task.name} meta={plainMeta(i.task, deptName(i.task.departmentId))} />
                  ))}
                </>
              )}
              {progressDone.length > 0 && (
                <>
                  <p className="soon-group__label">In Progress · {progressDone.length} finished</p>
                  {progressDone.map((i) => (
                    <DoneRow
                      key={i.task.id}
                      name={i.task.name}
                      meta={plainMeta(i.task, deptName(i.task.departmentId))}
                    />
                  ))}
                </>
              )}
              {carry.length > 0 && (
                <p className="done-day__carry">
                  {carry.length} more In Progress {carry.length === 1 ? 'task carries' : 'tasks carry'} over to tomorrow
                  {carryPriority > 0 ? `, ${carryPriority} of them Priority.` : '.'}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="done-day__none">Nothing checked off today. Tomorrow is a fresh start.</p>
      )}

      <section className="today-section" aria-labelledby="upcoming">
        <div className="today-section__head">
          <div>
            <p className="kicker">Tomorrow</p>
            <h2 id="upcoming" className="today-section__title">
              Upcoming
            </h2>
          </div>
        </div>
        <div className="today-card today-card--tight">
          <div className="upcoming-row">
            <div className="row-text">
              <span className="row-text__name row-text__name--strong">Opening</span>
              <span className="row-text__meta">Starts the day</span>
            </div>
            <span className="pill">{hhmmLabel(tomorrowHours.open)}</span>
          </div>
          {priorityTomorrow > 0 && (
            <div className="upcoming-row">
              <div className="upcoming-row__priority">
                <span className="priority-dot" aria-hidden />
                <div className="row-text">
                  <span className="row-text__name">
                    {priorityTomorrow} Priority {priorityTomorrow === 1 ? 'task' : 'tasks'} waiting
                  </span>
                  <span className="row-text__meta">Paused overnight</span>
                </div>
              </div>
            </div>
          )}
          {next.daily.map((i) => (
            <div key={i.task.id} className="upcoming-row">
              <div className="row-text">
                <span className="row-text__name">{i.task.name}</span>
                <span className="row-text__meta">{deptName(i.task.departmentId)} · Daily</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DoneRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="task-check">
      <span className="check is-done" aria-hidden>
        <Icon name="check" size={14} />
      </span>
      <div className="row-text">
        <span className="row-text__name is-done">{name}</span>
        <span className="row-text__meta">{meta}</span>
      </div>
    </div>
  );
}
