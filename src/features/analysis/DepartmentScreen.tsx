import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { useNow } from '../../ui/useNow';
import { useAnalysisData, type AnalysisData } from '../../data/analysis';
import { toDay, type Day } from '../../domain/dates';
import {
  FEELING_LABEL,
  LESS_OFTEN,
  SLIP_LABEL,
  cadenceWord,
  countWord,
  departmentStats,
  mostCommon,
  rangeFor,
  scoreOf,
  slipOf,
  taskStats,
  type DepartmentStats,
  type Range,
  type SlipKind,
  type TaskStats,
} from '../../domain/analysis';
import { CADENCES, CADENCE_LABEL, scheduleLabel, taskCountLabel } from '../../domain/tasks';
import { useRange } from './hooks';
import { SectionTitle, SuggestionNote } from './parts';
import './analysis.css';

/** Analysis: department detail (Figma 16:3597). */
export function DepartmentScreen() {
  const now = useNow();
  const T = toDay(now);
  const data = useAnalysisData(T);
  const { id } = useParams();
  if (!data) return <main className="screen" />;
  const department = data.departments.find((d) => d.id === id);
  if (!department) return <Navigate to="/analysis" replace />;
  return <Department data={data} T={T} id={department.id} />;
}

function Department({ data, T, id }: { data: AnalysisData; T: Day; id: string }) {
  const [range] = useRange();
  const navigate = useNavigate();
  const { from, to } = rangeFor(range, T, data.cal);
  const dept = useMemo(
    () => departmentStats(taskStats(data, from, to), data.departments).find((d) => d.department.id === id)!,
    [data, from, to, id],
  );
  const slipping = dept.tasks
    .map((s) => ({ s, kind: slipOf(s) }))
    .filter((x): x is { s: TaskStats; kind: SlipKind } => !!x.kind)
    .sort((a, b) => order(a.kind) - order(b.kind));
  const steady = dept.tasks.filter((s) => !slipOf(s) && s.task.timingMode === 'specific' && s.task.cadence !== 'daily');
  const reasons = dept.tasks.flatMap((s) => s.deferReasons);
  const topReason = mostCommon(reasons);
  const status = statusCopy(dept, range, topReason, slipping.length);
  const first = slipping[0]?.s.task;

  return (
    <main className="screen analysis">
      <header className="dept-header">
        <button type="button" className="back-button" onClick={() => goBack(navigate, '/analysis')}>
          <Icon name="chevron-left" size={22} label="Back to Analysis" />
        </button>
        <p className="kicker">Analysis · Department</p>
        <h1 className="page-header__title">{dept.department.name}</h1>
        <p className="dept-header__sub">
          {taskCountLabel(dept.tasks.length)} · this {range}
        </p>
      </header>

      <div className="screen__body">
        <section className={dept.feeling === 'reset' ? 'status-card is-reset' : 'status-card'}>
          <span className="status-card__chip">{dept.feeling ? FEELING_LABEL[dept.feeling] : 'Not enough yet'}</span>
          <h2 className="status-card__title">{status.title}</h2>
          <p className="status-card__body">{status.body}</p>
          {dept.feeling === 'reset' && first && (
            <button type="button" className="save-button" onClick={() => navigate(`/analysis/give/${first.id}`)}>
              Give {slipping.length > 1 ? 'these' : 'it'} a day
            </button>
          )}
        </section>

        {dept.tasks.length > 0 && (
          <>
            <SectionTitle title="Rhythm by cadence" subtitle="Weeks and months that found their time" />
            <div className="an-card cadence-rows">
              {CADENCES.map((c) => {
                const rows = dept.tasks.filter((s) => s.task.cadence === c);
                if (rows.length === 0) return null;
                const judged = rows.flatMap((s) => s.judged).filter((j) => ['onTime', 'late', 'missed', 'deferred'].includes(j.outcome));
                const recent = judged.slice(-8);
                const tally = rows.reduce(
                  (t, s) => ({
                    onTime: t.onTime + s.tally.onTime,
                    late: t.late + s.tally.late,
                    missed: t.missed + s.tally.missed,
                    deferred: t.deferred + s.tally.deferred,
                  }),
                  { onTime: 0, late: 0, missed: 0, deferred: 0 },
                );
                return (
                  <div key={c} className="cadence-row">
                    <span className="cadence-row__name">{CADENCE_LABEL[c]}</span>
                    <span className="cadence-row__dots" aria-hidden>
                      {recent.map((j, i) => (
                        <span key={i} className={`dash dash--${j.outcome}`} />
                      ))}
                      {recent.length === 0 && <span className="dash dash--open" />}
                    </span>
                    <span className="cadence-row__label">{cadenceLabel(scoreOf(tally), tally, rows, topReason)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {slipping.length > 0 && (
          <>
            <SectionTitle
              title={`Fine-tuning ${dept.department.name}`}
              subtitle="Tasks that keep slipping, and ways to make them fit"
            />
            <div className="slip-list">
              {slipping.slice(0, 3).map(({ s, kind }) => (
                <SlipCard key={s.task.id} s={s} kind={kind} range={range} />
              ))}
            </div>
          </>
        )}

        {steady.length > 0 && (
          <>
            <SectionTitle title="Already on your days" subtitle="Tasks with a set day that are running smoothly" />
            <div className="an-card an-card--list">
              {steady.map((s) => (
                <div key={s.task.id} className="steady-row">
                  <div className="row-text">
                    <span className="row-text__name">{s.task.name}</span>
                    <span className="row-text__meta">{CADENCE_LABEL[s.task.cadence]}</span>
                  </div>
                  <span className="pill">{scheduleLabel(s.task)}</span>
                  <Link to={`/plan/tasks/${s.task.id}`} className="steady-row__edit" aria-label={`Edit ${s.task.name}`}>
                    <Icon name="pencil" size={18} />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        {reasons.length > 0 && (
          <p className="an-quiet-card an-quiet-card--left">
            Set aside {countWord(reasons.length)} this {range}
            {topReason ? (
              <>
                , most often for <strong>{topReason.toLowerCase()}</strong>
              </>
            ) : null}
            . That is a good reason, and it is not counted against you.
          </p>
        )}
      </div>
    </main>
  );
}

function order(k: SlipKind) {
  return { setAside: 0, late: 1, behind: 2 }[k];
}

function statusCopy(d: DepartmentStats, range: Range, reason: string | null, slipping: number) {
  if (!d.feeling) {
    return {
      title: d.tasks.length ? 'Its rhythm will show here soon' : 'No tasks here yet',
      body: d.tasks.length
        ? 'Check off a few of its tasks on Today and this page will show how it is going.'
        : 'Add tasks for this part of the house in Plan, and they will show here.',
    };
  }
  if (d.feeling === 'flowing') {
    return { title: 'Flowing nicely', body: `Almost everything here found its time this ${range}. Nothing to change.` };
  }
  if (d.feeling === 'steady') {
    return {
      title: 'Mostly steady',
      body: `Most of what is planned here found its time this ${range}.${slipping ? ' A task or two below could use a small change.' : ''}`,
    };
  }
  if (reason === 'Weather') {
    return {
      title: 'Seasonal work is waiting on good weather',
      body: 'Most of what has been set aside is weather-dependent, so this is a natural pause. A day or two set aside could clear most of it.',
    };
  }
  return {
    title: 'A few tasks keep slipping',
    body: 'That usually means the plan asks a little more than this season has room for. A day set aside, or a gentler rhythm, could clear most of it.',
  };
}

function cadenceLabel(score: number | null, t: { deferred: number }, rows: TaskStats[], reason: string | null) {
  if (score === null) return t.deferred > 0 && reason === 'Weather' ? 'Waiting on weather' : 'Not enough yet';
  const allDone = rows.every((s) => s.judged.every((j) => j.outcome !== 'missed' && j.outcome !== 'late'));
  if (score === 100 && allDone) return 'All done';
  if (score >= 85) return 'Mostly steady';
  if (score >= 65) return 'Finding its way';
  return reason === 'Weather' ? 'Waiting on weather' : 'Ready for a reset';
}

function SlipCard({ s, kind, range }: { s: TaskStats; kind: SlipKind; range: Range }) {
  const navigate = useNavigate();
  const less = LESS_OFTEN[s.task.cadence];
  const reason = mostCommon(s.deferReasons);
  const detail =
    kind === 'setAside'
      ? `Set aside ${countWord(s.tally.deferred)} this ${range}${reason ? `, mostly for ${reason.toLowerCase()}` : ''}.`
      : kind === 'late'
        ? `Finished late or missed in most ${unitOf(s)} this ${range}.`
        : `Usually done a little after its time.`;
  const tip =
    kind === 'setAside'
      ? 'A fixed day when it suits you could give it a real home.'
      : kind === 'late' && less
        ? `It may fit better as a ${cadenceWord(less)} task, which would ease your ${unitOf(s).replace(/s$/, '')}.`
        : 'A set day that is usually light could help it land on time.';
  const give = (
    <button type="button" className="save-button slip-card__btn" onClick={() => navigate(`/analysis/give/${s.task.id}`)}>
      Give it a day
    </button>
  );
  const giveSecondary = (
    <button type="button" className="slip-card__secondary" onClick={() => navigate(`/analysis/give/${s.task.id}`)}>
      Give it a day
    </button>
  );
  return (
    <section className="slip-card">
      <div className="slip-card__head">
        <h3>{s.task.name}</h3>
        <span className="slip-card__chip">{SLIP_LABEL[kind]}</span>
      </div>
      <p className="slip-card__cadence">{CADENCE_LABEL[s.task.cadence]}</p>
      <p className="slip-card__detail">{detail}</p>
      <SuggestionNote>{tip}</SuggestionNote>
      <div className="slip-card__actions">
        {kind === 'late' && less ? (
          <>
            <button
              type="button"
              className="save-button slip-card__btn"
              onClick={() => navigate(`/plan/tasks/${s.task.id}?suggest=${less}&why=late`)}
            >
              Make it {cadenceWord(less)}
            </button>
            {giveSecondary}
          </>
        ) : kind === 'setAside' && less ? (
          <>
            {give}
            <button
              type="button"
              className="slip-card__secondary"
              onClick={() => navigate(`/plan/tasks/${s.task.id}?suggest=${less}&why=setAside`)}
            >
              Change how often
            </button>
          </>
        ) : (
          give
        )}
      </div>
    </section>
  );
}

function unitOf(s: TaskStats) {
  return { daily: 'days', weekly: 'weeks', monthly: 'months', seasonal: 'seasons', yearly: 'years' }[s.task.cadence];
}
