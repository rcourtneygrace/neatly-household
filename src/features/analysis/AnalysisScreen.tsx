import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, PageHeader } from '../../ui';
import { useNow } from '../../ui/useNow';
import { useHouseholdDay } from '../../data/day';
import { useAnalysisData, type AnalysisData } from '../../data/analysis';
import { fromDay, hhmmLabel, makeDay, toDay, type Day } from '../../domain/dates';
import {
  RANGE_LABEL,
  RHYTHM_FIRST_HOUR,
  RHYTHM_HOURS,
  cadenceWord,
  countWord,
  dayRhythmSentence,
  departmentStats,
  heatLevels,
  homeHealth,
  monthHeat,
  monthSentence,
  rangeFor,
  rhythm,
  suggestionFor,
  taskStats,
  weekRhythm,
  type Suggestion,
} from '../../domain/analysis';
import { MONTHS } from '../../domain/tasks';
import { FeelingText, Ring, SectionTitle, SuggestionNote } from './parts';
import { RANGES, suggestionKey, useDismissed, useRange } from './hooks';
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

function Analysis({ data, T }: { data: AnalysisData; T: Day }) {
  const [range, setRange] = useRange();
  const navigate = useNavigate();
  const dismissed = useDismissed();
  const { from, to } = rangeFor(range, T, data.cal);

  const stats = useMemo(() => taskStats(data, from, to), [data, from, to]);
  const depts = useMemo(() => departmentStats(stats, data.departments), [stats, data.departments]);
  const health = homeHealth(depts, range);
  const r = useMemo(() => rhythm(data, from, to), [data, from, to]);
  const suggestion = stats
    .map(suggestionFor)
    .find((s): s is Suggestion => !!s && !dismissed.isHidden(suggestionKey(s)));

  return (
    <main className="screen analysis">
      <PageHeader title="Analysis" subtitle="A calm look at how your home is running" />

      <div className="screen__body">
        <div className="segmented an-range" role="radiogroup" aria-label="Look back over">
          {RANGES.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={range === x}
              className={range === x ? 'segmented__item is-selected' : 'segmented__item'}
              onClick={() => setRange(x)}
            >
              {RANGE_LABEL[x]}
            </button>
          ))}
        </div>

        <section className="health-card" aria-labelledby="health-title">
          <p className="health-card__kicker">
            <Icon name="sprout" size={20} />
            Home health · this {range}
          </p>
          <h2 id="health-title" className="health-card__title">
            {health.title}
          </h2>
          <p className="health-card__body">{health.body}</p>
        </section>

        <SectionTitle title="How each department is feeling" subtitle="Tap a department for a closer look" />
        <div className="dept-grid">
          {depts.map((d) => (
            <Link
              key={d.department.id}
              to={`/analysis/department/${d.department.id}${range === 'season' ? '' : `?range=${range}`}`}
              className={d.feeling === 'reset' ? 'dept-tile is-reset' : 'dept-tile'}
              aria-label={`${d.department.name}: ${d.score === null ? 'not enough yet' : `${d.score}, ${d.feeling === 'reset' ? 'ready for a reset' : d.feeling}`}`}
            >
              <Ring score={d.score} feeling={d.feeling} />
              <span className="dept-tile__name">{d.department.name}</span>
              <FeelingText feeling={d.feeling} />
            </Link>
          ))}
        </div>
        <p className="an-caption">
          The fuller the ring, the more of this {range} found its rhythm. A gentle guide, not a grade.
        </p>

        <SectionTitle title="Fine-tuning your system" subtitle="Small adjustments that fit your home better" />
        {suggestion ? (
          <section className="suggest-card" aria-labelledby="suggest-title">
            <p className="suggest-card__kicker">
              <span className="suggest-card__icon">
                <Icon name="leaf" size={20} />
              </span>
              A gentle suggestion
            </p>
            <h3 id="suggest-title" className="suggest-card__title">
              Would “{suggestion.task.name}” fit better as a {cadenceWord(suggestion.to)} task?
            </h3>
            <p className="suggest-card__body">{suggestionBody(suggestion)}</p>
            <button
              type="button"
              className="save-button suggest-card__primary"
              onClick={() => navigate(`/plan/tasks/${suggestion.task.id}?suggest=${suggestion.to}&why=${suggestion.kind}`)}
            >
              Make it {cadenceWord(suggestion.to)}
            </button>
            <div className="suggest-card__row">
              <button type="button" className="suggest-card__keep" onClick={() => dismissed.keep(suggestionKey(suggestion))}>
                Keep it {cadenceWord(suggestion.task.cadence)}
              </button>
              <button type="button" className="suggest-card__later" onClick={() => dismissed.notNow(suggestionKey(suggestion))}>
                Not now
              </button>
            </div>
          </section>
        ) : (
          <p className="an-quiet-card">Nothing to fine-tune right now.</p>
        )}
        <p className="an-caption">Suggestions only appear when a pattern is clear.</p>

        <SectionTitle title="Your daily rhythm" subtitle="How a typical day in your household unfolds" />
        {r.total < 5 ? (
          <p className="an-quiet-card">Your rhythm will show here after a couple of weeks of check-offs on Today.</p>
        ) : (
          <DailyRhythm r={r} />
        )}

        <SectionTitle title="Your monthly rhythm" subtitle="How the work flows across a typical month" />
        <MonthlyRhythm data={data} T={T} from={from} to={to} />
      </div>
    </main>
  );
}

function suggestionBody(s: Suggestion) {
  const from = cadenceWord(s.task.cadence);
  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', seasonal: 'seasons', yearly: 'years' }[s.task.cadence];
  const why =
    s.kind === 'setAside'
      ? `It has been set aside ${countWord(s.count).replace('once', 'one time')} in a row`
      : `It ran late in ${s.count} of the last 4 ${unit}`;
  return `${why}, which often means a ${from} rhythm is more than your home needs right now. A ${cadenceWord(s.to)} slot could take the pressure off, and nothing changes until you choose.`;
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
