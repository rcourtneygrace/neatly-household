import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { useNow } from '../../ui/useNow';
import { giveItADay, useAnalysisData, type AnalysisData } from '../../data/analysis';
import type { Task } from '../../data/types';
import { addDays, fromDay, makeDay, shortDate, toDay, type Day } from '../../domain/dates';
import { countWord, rhythm, nextWeekday, resetDays, taskStats } from '../../domain/analysis';
import { cadenceShort } from '../../domain/schedule';
import { CADENCE_LABEL, MONTHS, WEEKDAYS } from '../../domain/tasks';
import '../records/record-form.css';
import '../today/today.css';
import './analysis.css';

/** Give it a day (Figma 16:2599): plan one catch-up day. The usual schedule stays the same. */
export function GiveADayScreen() {
  const now = useNow();
  const T = toDay(now);
  const data = useAnalysisData(T);
  const { taskId } = useParams();
  if (!data) return null;
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return <Navigate to="/analysis" replace />;
  return <GiveADay data={data} task={task} T={T} />;
}

function longDay(day: Day) {
  const d = fromDay(day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function GiveADay({ data, task, T }: { data: AnalysisData; task: Task; T: Day }) {
  const navigate = useNavigate();
  const dept = data.departments.find((d) => d.id === task.departmentId)?.name ?? '';
  const year = useMemo(() => ({ from: addDays(T, -365), to: T }), [T]);
  const days = resetDays(rhythm(data, year.from, year.to));
  const suggested = [
    { day: nextWeekday(addDays(T, 1), days.busiest), why: 'Your big reset day' },
    { day: nextWeekday(addDays(T, 1), days.lightest), why: 'Your lightest day' },
  ].sort((a, b) => a.day.localeCompare(b.day));
  const [picked, setPicked] = useState<Day>(suggested[0].day);
  const t0 = fromDay(T);
  const [month, setMonth] = useState({ y: t0.getFullYear(), m: t0.getMonth() });
  const setAside = taskStats({ ...data, tasks: [task] }, year.from, year.to)[0]?.tally.deferred ?? 0;

  const first = fromDay(makeDay(month.y, month.m, 1)).getDay();
  const length = new Date(month.y, month.m + 1, 0).getDate();
  const atThisMonth = month.y === t0.getFullYear() && month.m === t0.getMonth();
  const shiftMonth = (k: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + k, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const weekday = WEEKDAYS[fromDay(picked).getDay()];
  const weekStartDate = t0.getDate() - t0.getDay();

  const onAdd = async () => {
    await giveItADay(task, picked, data.cal);
    goBack(navigate, '/today');
  };

  return (
    <div className="sheet-screen">
      <div className="sheet">
        <div className="sheet__handle" aria-hidden />
        <p className="kicker">Give it a day</p>
        <h1 className="give__title">{task.name}</h1>
        <p className="give__intro">
          {dept} · {CADENCE_LABEL[task.cadence]}.
          {setAside > 0 ? ` It has been set aside ${countWord(setAside)}.` : ''} Choose a day to catch up, just this once.
        </p>

        <h2 className="give__label">Suggested days</h2>
        <div className="give__options" role="radiogroup" aria-label="Suggested days">
          {suggested.map((s) => (
            <button
              key={s.day}
              type="button"
              role="radio"
              aria-checked={picked === s.day}
              className={picked === s.day ? 'give-option is-on' : 'give-option'}
              onClick={() => setPicked(s.day)}
            >
              <span className="give-option__radio" aria-hidden />
              <span className="row-text">
                <span className="give-option__day">{longDay(s.day)}</span>
                <span className="row-text__meta">{s.why}</span>
              </span>
            </button>
          ))}
        </div>

        <h2 className="give__label">Or pick any day</h2>
        <div className="give-cal__head">
          <span className="give-cal__month">
            {MONTHS[month.m]} {month.y}
          </span>
          <button type="button" className="give-cal__nav" disabled={atThisMonth} onClick={() => shiftMonth(-1)}>
            <Icon name="chevron-left" size={18} label="Previous month" />
          </button>
          <button type="button" className="give-cal__nav" onClick={() => shiftMonth(1)}>
            <Icon name="chevron-right" size={18} label="Next month" />
          </button>
        </div>
        <div className="give-cal" role="grid" aria-label={`${MONTHS[month.m]} ${month.y}`}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={`h${i}`} className="give-cal__dow" aria-hidden>
              {d}
            </span>
          ))}
          {Array.from({ length: atThisMonth ? 0 : first }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length }, (_, i) => {
            const day = makeDay(month.y, month.m, i + 1);
            // This month starts at the current week, as in Figma
            if (atThisMonth && i + 1 < weekStartDate) return null;
            const past = day < T;
            return (
              <button
                key={day}
                type="button"
                disabled={past}
                aria-pressed={picked === day}
                aria-label={`${longDay(day)}${day === T ? ', today' : ''}`}
                className={`give-cal__day${day === T ? ' is-today' : ''}${picked === day ? ' is-on' : ''}`}
                onClick={() => setPicked(day)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="an-caption an-caption--left">Today is outlined. Tap the arrow for next month.</p>

        <div className="give-preview">
          <p className="kicker">How this will show up</p>
          <p className="give-preview__text">
            {picked === T ? 'Today' : `On ${weekday}`}, it shows at the top of In Progress with a Today tag. After that, it goes
            back to its usual {CADENCE_LABEL[task.cadence].toLowerCase()} schedule.
          </p>
          <div className="give-preview__row">
            <span className="check" aria-hidden />
            <span className="row-text">
              <span className="row-text__name">{task.name}</span>
              <span className="row-text__meta">
                {dept} · {cadenceShort(task)}
              </span>
            </span>
            <span className="tag">
              <span className="tag__dot" aria-hidden />
              Today
            </span>
          </div>
          <p className="an-caption an-caption--left">If it was set aside, it leaves Priority once it has a day.</p>
        </div>

        <div className="sheet__spacer" />
        <button type="button" className="save-button" onClick={onAdd}>
          Add to {picked === T ? 'today' : `${WEEKDAYS[fromDay(picked).getDay()]}, ${shortDate(picked)}`}
        </button>
        <button type="button" className="byd__skip" onClick={() => goBack(navigate, '/analysis')}>
          Not now
        </button>
        <p className="an-caption">Your usual schedule stays the same.</p>
      </div>
    </div>
  );
}
