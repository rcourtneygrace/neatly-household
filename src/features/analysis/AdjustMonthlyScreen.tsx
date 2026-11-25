import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { useTasks, useDepartments } from '../../data/tasks';
import { moveMonthlyTasks } from '../../data/analysis';
import { MONTH_WEEKS, balanceSuggestion, monthBalance, monthlySpecific, weekOfMonth } from '../../domain/analysis';
import { monthDayLabel, ordinal } from '../../domain/tasks';
import '../plan/plan.css';
import './analysis.css';

/** Analysis: adjust monthly tasks (Figma 16:3805). */
export function AdjustMonthlyScreen() {
  const tasks = useTasks();
  const departments = useDepartments();
  if (!tasks || !departments) return null;
  return <AdjustMonthly key={tasks.map((t) => `${t.id}${t.timingValue}`).join()} tasks={tasks} deptName={(id) => departments.find((d) => d.id === id)?.name ?? ''} />;
}

function AdjustMonthly({ tasks, deptName }: { tasks: NonNullable<ReturnType<typeof useTasks>>; deptName: (id: string) => string }) {
  const navigate = useNavigate();
  const { counts, labels } = monthBalance(tasks);
  const max = Math.max(...counts, 1);
  const suggestion = balanceSuggestion(tasks);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suggestion?.moves.map((m) => m.task.id)));
  const [hidden, setHidden] = useState(false);
  const monthly = monthlySpecific(tasks).sort((a, b) => dayOrder(a.timingValue as number) - dayOrder(b.timingValue as number));
  const ord = ['first', 'second', 'third', 'last'];
  const wordFor = ['one', 'two', 'three', 'four'];
  const chosenMoves = suggestion?.moves.filter((m) => chosen.has(m.task.id)) ?? [];

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/analysis')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Adjust monthly tasks</h1>
          <p className="pushed__subtitle">Nudge a few tasks to even out your month</p>
        </div>
      </header>

      <section className="an-card balance">
        <h2 className="an-card__subhead">How your month is balanced</h2>
        {MONTH_WEEKS.map((w, i) => (
          <div key={w.label} className="balance-row">
            <div className="balance-row__label">
              <span>{w.label}</span>
              <span>{w.range}</span>
            </div>
            <span className="balance-row__track">
              <span
                className={labels[i] === 'Fullest' ? 'balance-row__fill is-full' : 'balance-row__fill'}
                style={{ width: `${(counts[i] / max) * 100}%` }}
              />
            </span>
            <span className={labels[i] === 'Fullest' ? 'balance-row__word is-full' : 'balance-row__word'}>{labels[i]}</span>
          </div>
        ))}
        <p className="an-caption an-caption--left">Based on where your monthly tasks are set to land.</p>
      </section>

      {suggestion && !hidden && (
        <section className="suggest-card">
          <p className="suggest-card__kicker suggest-card__kicker--plain">
            <Icon name="leaf" size={16} />A gentle suggestion
          </p>
          <h2 className="suggest-card__title">Give week {wordFor[suggestion.to]} some of the work</h2>
          <p className="suggest-card__body">
            The {ord[suggestion.from]} week carries the most. Moving{' '}
            {suggestion.moves.length === 1 ? 'this one' : `these ${wordFor[suggestion.moves.length - 1]}`} to the{' '}
            {ordinal(suggestion.moves[0].toDay)} would smooth your whole month. Uncheck any you would rather leave.
          </p>
          <div className="move-list">
            {suggestion.moves.map((m) => {
              const on = chosen.has(m.task.id);
              return (
                <button
                  key={m.task.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="move-row"
                  onClick={() =>
                    setChosen((c) => {
                      const n = new Set(c);
                      if (on) n.delete(m.task.id);
                      else n.add(m.task.id);
                      return n;
                    })
                  }
                >
                  <span className={on ? 'byd__box is-on' : 'byd__box'} aria-hidden>
                    {on && <Icon name="check" size={14} />}
                  </span>
                  <span className="row-text">
                    <span className="row-text__name">{m.task.name}</span>
                    <span className="row-text__meta">{deptName(m.task.departmentId)}</span>
                  </span>
                  <span className="move-row__days">
                    {ordinal(m.fromDay)} <span aria-label="to">→</span> <strong>{ordinal(m.toDay)}</strong>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="save-button suggest-card__primary"
            disabled={chosenMoves.length === 0}
            onClick={() => moveMonthlyTasks(chosenMoves.map((m) => ({ taskId: m.task.id, toDay: m.toDay })))}
          >
            Move {chosenMoves.length === 1 ? '1 task' : `${chosenMoves.length} tasks`}
          </button>
          <button type="button" className="suggest-card__later suggest-card__later--block" onClick={() => setHidden(true)}>
            Not now
          </button>
        </section>
      )}

      <div className="an-section-title">
        <h2>All monthly tasks</h2>
        <p>Tap one to change its day</p>
      </div>
      {monthly.length === 0 && <p className="an-quiet-card">No monthly tasks with a set day yet.</p>}
      {MONTH_WEEKS.map((w, i) => {
        const rows = monthly.filter((t) => weekOfMonth(t.timingValue as number) === i);
        if (rows.length === 0) return null;
        return (
          <div key={w.label} className="month-week">
            <p className="kicker">{w.label}</p>
            <div className="plan-group__rows month-week__rows">
              {rows.map((t) => (
                <Link key={t.id} to={`/plan/tasks/${t.id}`} className="task-row task-row--compact">
                  <span className="task-row__text">
                    <span className="task-row__name">{t.name}</span>
                    <span className="task-row__meta">
                      {deptName(t.departmentId)} · {dayText(t.timingValue as number)}
                    </span>
                  </span>
                  <span className="task-row__chevron">
                    <Icon name="chevron-right" size={22} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      <p className="an-caption">Tasks set to “Every month” with no set day are not shown here.</p>
    </main>
  );
}

function dayOrder(v: number) {
  return v === -1 ? 32 : v;
}

function dayText(v: number) {
  return v === -1 ? 'Last day of month' : v === 1 ? '1st of month' : `${monthDayLabel(v)} of month`;
}
