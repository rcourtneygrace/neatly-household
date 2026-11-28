import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '../../ui';
import { useNow } from '../../ui/useNow';
import { useHouseholdDay } from '../../data/day';
import { useAnalysisData, type AnalysisData } from '../../data/analysis';
import { addDays, fromDay, hhmmLabel, makeDay, toDay, type Day } from '../../domain/dates';
import {
  PATTERN_DAYS,
  RHYTHM_FIRST_HOUR,
  RHYTHM_HOURS,
  cadenceWord,
  dayRhythmSentence,
  departmentStats,
  heatLevels,
  homeFocus,
  monthHeat,
  monthSentence,
  recentTaskStats,
  rhythm,
  slipOf,
  suggestionFor,
  weekRhythm,
  type Suggestion,
  type TaskStats,
} from '../../domain/analysis';
import { CADENCE_LABEL, MONTHS } from '../../domain/tasks';
import { FeelingText, Ring, SectionTitle, SuggestionNote } from './parts';
import { suggestionKey, useDismissed } from './hooks';
import '../settings/plan-settings.css';
import './analysis.css';

/** Analysis: home health (Figma 16:3183). */
export function AnalysisScreen() {
  const now = useNow();
  const T = useHouseholdDay(now) ?? toDay(now);
  const data = useAnalysisData(T);
  if (!data) return <main className="screen" />;
  return <Analysis data={data} T={T} />;
}

/** A task that keeps slipping, with the gentlest fix that fits. */
interface Attention {
  stats: TaskStats;
  /** A clear pattern: offer a gentler rhythm */
  suggestion?: Suggestion;
  kind: 'setAside' | 'late';
}

function Analysis({ data, T }: { data: AnalysisData; T: Day }) {
  const navigate = useNavigate();
  const dismissed = useDismissed();
  const from = addDays(T, -PATTERN_DAYS);

  const stats = useMemo(() => recentTaskStats(data), [data]);
  const depts = useMemo(() => departmentStats(stats, data.departments), [stats, data.departments]);
  const home = homeFocus(depts);
  const r = useMemo(() => rhythm(data, from, T), [data, from, T]);
  const deptName = (id: string) => data.departments.find((d) => d.id === id)?.name ?? '';

  // Up to three tasks that keep slipping: clear patterns first
  const attention: Attention[] = [];
  for (const s of stats) {
    const sug = suggestionFor(s);
    if (sug && !dismissed.isHidden(suggestionKey(sug))) attention.push({ stats: s, suggestion: sug, kind: sug.kind });
  }
  for (const s of stats) {
    if (attention.some((a) => a.stats === s)) continue;
    const kind = slipOf(s);
    if ((kind === 'setAside' || kind === 'late') && !dismissed.isHidden(`${s.task.id}:slip`)) attention.push({ stats: s, kind });
  }

  return (
    <main className="screen analysis">
      <PageHeader title="Analysis" subtitle="A calm look at how your home is running" />

      <div className="screen__body">
        <section className="health-card" aria-labelledby="health-title">
          <p className="health-card__kicker">
            <Icon name="sprout" size={20} />
            Where your time is best spent
          </p>
          <h2 id="health-title" className="health-card__title">
            {home.title}
          </h2>
          {home.empty && <p className="health-card__body">Check off a few tasks on Today and this will fill in.</p>}
          {home.focus.length > 0 && (
            <>
              <p className="health-card__body">
                If you have some spare time, {home.focus.length > 1 ? 'these would' : 'this would'} feel it most:
              </p>
              <div className="focus-chips">
                {home.focus.map((d) => (
                  <Link key={d.department.id} to={`/analysis/department/${d.department.id}`} className="focus-chip">
                    {d.department.name}
                    <Icon name="chevron-right" size={16} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        {attention.length > 0 && (
          <>
            <SectionTitle title="Small changes that could help" />
            <div className="slip-list">
              {attention.slice(0, 3).map((a) => (
                <AttentionCard
                  key={a.stats.task.id}
                  a={a}
                  dept={deptName(a.stats.task.departmentId)}
                  onKeep={() => dismissed.keep(a.suggestion ? suggestionKey(a.suggestion) : `${a.stats.task.id}:slip`)}
                  onOpen={(to) => navigate(to)}
                />
              ))}
            </div>
          </>
        )}

        <SectionTitle title="Departments" subtitle="Tap one for a closer look" />
        <div className="dept-grid">
          {depts.map((d) => (
            <Link
              key={d.department.id}
              to={`/analysis/department/${d.department.id}`}
              className={d.feeling === 'reset' ? 'dept-tile is-reset' : 'dept-tile'}
              aria-label={`${d.department.name}: ${d.feeling === null ? 'not enough yet' : d.feeling === 'reset' ? 'ready for a reset' : d.feeling}`}
            >
              <Ring score={d.score} feeling={d.feeling} />
              <span className="dept-tile__name">{d.department.name}</span>
              <FeelingText feeling={d.feeling} />
            </Link>
          ))}
        </div>

        <SectionTitle title="Your patterns" />
        {r.total < 5 ? (
          <p className="an-quiet-card">Your patterns will show here after a couple of weeks of check-offs on Today.</p>
        ) : (
          <DailyRhythm r={r} />
        )}
        <MonthlyRhythm data={data} T={T} from={addDays(T, -90)} to={T} />
      </div>
    </main>
  );
}

function AttentionCard({
  a,
  dept,
  onKeep,
  onOpen,
}: {
  a: Attention;
  dept: string;
  onKeep: () => void;
  onOpen: (to: string) => void;
}) {
  const { task } = a.stats;
  const lead = a.kind === 'setAside' ? 'Keeps getting set aside.' : 'Keeps getting pushed.';
  const text = a.suggestion
    ? `${lead} Would it fit better as a ${cadenceWord(a.suggestion.to)} task?`
    : `${lead} Giving it a set day on a lighter day could help.`;
  return (
    <section className="slip-card">
      <div className="slip-card__head">
        <h3>{task.name}</h3>
      </div>
      <p className="slip-card__cadence">
        {dept ? `${dept} · ` : ''}
        {CADENCE_LABEL[task.cadence]}
      </p>
      <p className="slip-card__detail">{text}</p>
      <div className="slip-card__actions">
        {a.suggestion ? (
          <button
            type="button"
            className="save-button slip-card__btn"
            onClick={() => onOpen(`/plan/tasks/${task.id}?suggest=${a.suggestion!.to}&why=${a.suggestion!.kind}`)}
          >
            Make it {cadenceWord(a.suggestion.to)}
          </button>
        ) : (
          <button type="button" className="save-button slip-card__btn" onClick={() => onOpen(`/analysis/give/${task.id}`)}>
            Give it a day
          </button>
        )}
        <button type="button" className="slip-card__secondary" onClick={onKeep}>
          Keep it as is
        </button>
      </div>
    </section>
  );
}

/* ---------- Daily rhythm (Figma 16:3363) ---------- */

function DailyRhythm({ r }: { r: ReturnType<typeof rhythm> }) {
  const max = Math.max(...r.hours, 1);
  const week = weekRhythm(r);
  const wmax = Math.max(...r.week, 1);
  const pos = (mins: number) => `${Math.max(0, Math.min(100, ((mins - RHYTHM_FIRST_HOUR * 60) / (RHYTHM_HOURS * 60)) * 100))}%`;
  const label = (m: number) => hhmmLabel(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return (
    <section className="an-card">
      <div className="an-card__head">
        <h3>Opening to closing</h3>
        {r.openAt !== null && r.closeAt !== null && (
          <span>
            around {label(r.openAt)} to {label(r.closeAt)}
          </span>
        )}
      </div>
      <div className="hour-markers" aria-hidden>
        {r.openAt !== null && (
          <span style={{ left: pos(r.openAt) }}>
            <Icon name="sun" size={18} />
          </span>
        )}
        {r.closeAt !== null && (
          <span style={{ left: pos(r.closeAt) }}>
            <Icon name="moon" size={18} />
          </span>
        )}
      </div>
      <div className="hour-bars" role="img" aria-label={dayRhythmSentence(r)}>
        {r.hours.map((n, i) => (
          <span key={i} className={`hour-bar lvl-${level(n, max)}`} style={{ height: `${Math.max(6, (n / max) * 64)}px` }} />
        ))}
      </div>
      <div className="hour-labels" aria-hidden>
        {['6a', '10a', '2p', '6p', '10p'].map((l, i) => (
          <span key={l} style={{ left: `${(i * 4 * 100) / RHYTHM_HOURS}%` }}>
            {l}
          </span>
        ))}
      </div>
      <p className="an-card__text">{dayRhythmSentence(r)}</p>

      <hr className="an-card__rule" />
      <h3 className="an-card__subhead">Across the week</h3>
      <div className="week-bars" role="img" aria-label={week.sentence}>
        {r.week.map((n, i) => (
          <span key={i} className="week-bars__col">
            <span
              className={n === Math.max(...r.week) && n > 0 ? 'week-bar is-top' : 'week-bar'}
              style={{ height: `${Math.max(6, (n / wmax) * 64)}px` }}
            />
            <span className="week-bars__day">{'MTWTFSS'[i]}</span>
          </span>
        ))}
      </div>
      <p className="an-card__text">{week.sentence}</p>
      {week.tip && <SuggestionNote>{week.tip}</SuggestionNote>}
    </section>
  );
}

function level(n: number, max: number) {
  const x = n / max;
  return x > 0.66 ? 3 : x > 0.33 ? 2 : 1;
}

/* ---------- Monthly rhythm (Figma 16:3469) ---------- */

function MonthlyRhythm({ data, T, from, to }: { data: AnalysisData; T: Day; from: Day; to: Day }) {
  const navigate = useNavigate();
  const t = fromDay(T);
  const heat = heatLevels(monthHeat(data, from, to));
  const firstWeekday = fromDay(makeDay(t.getFullYear(), t.getMonth(), 1)).getDay();
  const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const { sentence, tip } = monthSentence(data.tasks);
  return (
    <section className="an-card">
      <p className="visually-hidden">{MONTHS[t.getMonth()]}, from quieter to busier days</p>
      <div className="heat-grid" aria-hidden>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`h${i}`} className="heat-grid__head">
            {d}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className={`heat-cell lvl-${heat[i + 1]}`}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="heat-legend" aria-hidden>
        Quieter
        <span className="heat-cell lvl-1" />
        <span className="heat-cell lvl-2" />
        <span className="heat-cell lvl-3" />
        Busier
      </div>
      <p className="an-card__text">{sentence}</p>
      {tip && <SuggestionNote>{tip}</SuggestionNote>}
      <button type="button" className="outline-button outline-button--wide an-card__button" onClick={() => navigate('/analysis/monthly')}>
        Adjust monthly tasks
      </button>
    </section>
  );
}
