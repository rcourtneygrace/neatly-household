import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { ActionSheet } from '../../ui/ActionSheet';
import { ChoiceGroup, Toggle } from '../../ui/controls';
import { useHousehold } from '../../data/hooks';
import { deleteTask, saveTask, useDepartments, useTask } from '../../data/tasks';
import type { Cadence, Department, Household, SeasonName, Task, TimingMode } from '../../data/types';
import {
  CADENCES,
  CADENCE_LABEL,
  MONTHLY_RUNWAY,
  MONTHS,
  MONTHS_SHORT,
  MONTH_DAY_OPTIONS,
  SEASONS,
  SEASON_LABEL,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  defaultTiming,
  everyInfo,
  monthDayLabel,
  previewText,
  timingChoices,
  timingIsComplete,
  type Timing,
} from '../../domain/tasks';
import '../records/record-form.css';
import './task-form.css';

/** Add task (Figma 16:800) and Edit task (16:1939 and the per-cadence variants). */
export function TaskFormScreen() {
  const { id } = useParams();
  const task = useTask(id);
  const departments = useDepartments();
  const household = useHousehold();
  if (!departments || !household || (id && task === undefined)) return null; // loading
  if (id && task === null) return <Navigate to="/plan" replace />;
  return (
    <TaskForm key={task?.id ?? 'new'} existing={task ?? undefined} departments={departments} household={household} />
  );
}

// Monday-first, as in the Figma day picker
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function TaskForm({ existing, departments, household }: { existing?: Task; departments: Department[]; household: Household }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [today] = useState(() => new Date());
  const seasons = household.seasonStartDates;

  const initialCadence = (CADENCES.includes(params.get('cadence') as Cadence) ? params.get('cadence') : 'weekly') as Cadence;
  // Opened from an Analysis suggestion ("Make it monthly" / "Change how often")
  const suggest = existing && CADENCES.includes(params.get('suggest') as Cadence) ? (params.get('suggest') as Cadence) : null;
  const why = params.get('why');
  const [name, setName] = useState(existing?.name ?? '');
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? departments[0]?.id ?? '');
  const [timing, setTiming] = useState<Timing>(() =>
    suggest
      ? defaultTiming(suggest, 'every', today, seasons)
      : existing
        ? { cadence: existing.cadence, timingMode: existing.timingMode, timingValue: existing.timingValue }
        : defaultTiming(initialCadence, 'specific', today, seasons),
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [paused, setPaused] = useState(existing?.paused ?? false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const choices = timingChoices(timing.cadence);
  const info = timing.timingMode === 'every' ? everyInfo(timing.cadence) : null;
  const specific = timing.timingMode === 'specific' && timing.cadence !== 'daily';

  const changeCadence = (cadence: Cadence) => {
    if (cadence === timing.cadence) return;
    // keep the Specific/Every choice when moving between cadences
    setTiming(defaultTiming(cadence, timing.timingMode === 'every' ? 'every' : 'specific', today, seasons));
  };
  const changeMode = (mode: TimingMode) => {
    if (mode !== timing.timingMode) setTiming(defaultTiming(timing.cadence, mode, today, seasons));
  };
  const setValue = (timingValue: Timing['timingValue']) => setTiming((t) => ({ ...t, timingValue }));

  const onSave = async () => {
    setError(undefined);
    if (!name.trim()) {
      setError('Add a name to save this task.');
      return;
    }
    if (!timingIsComplete(timing)) {
      setError('Pick when this task happens.');
      return;
    }
    setSaving(true);
    try {
      await saveTask({ name, departmentId, notes, paused, ...timing }, existing?.id);
      goBack(navigate, '/plan');
    } catch {
      setError('Something went wrong saving. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="sheet-screen">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="sheet__handle" aria-hidden />
        <h1 className="sheet__title">{existing ? 'Edit task' : 'Add task'}</h1>

        {suggest && existing && (
          <div className="suggested-change">
            <p className="suggested-change__kicker">
              <Icon name="leaf" size={16} />
              Suggested change
            </p>
            <p className="suggested-change__pills">
              <span className="suggested-change__from">{CADENCE_LABEL[existing.cadence]}</span>
              <span aria-label="to">→</span>
              <span className="suggested-change__to">{CADENCE_LABEL[suggest]}</span>
            </p>
            <p className="suggested-change__why">
              {why === 'setAside' ? 'It was often set aside this season.' : 'It was often running late this season.'} A{' '}
              {CADENCE_LABEL[suggest].toLowerCase()} rhythm gives it more room and eases your{' '}
              {{ daily: 'day', weekly: 'week', monthly: 'month', seasonal: 'season', yearly: 'year' }[existing.cadence]}. Your
              history stays as it is.
            </p>
          </div>
        )}

        <label className="field">
          <span className="field__label">Task name</span>
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!existing}
            autoComplete="off"
            enterKeyHint="done"
            required
            aria-required="true"
          />
        </label>

        <label className="field field--gap">
          <span className="field__label">Department</span>
          <span className="select-wrap">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={18} />
          </span>
        </label>

        <ChoiceGroup
          label="Cadence"
          value={timing.cadence}
          choices={CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))}
          onChange={changeCadence}
        />

        {choices && (
          <ChoiceGroup
            label="Timing"
            value={timing.timingMode}
            choices={[
              { value: 'specific' as TimingMode, label: choices.specific },
              { value: 'every' as TimingMode, label: choices.every },
            ]}
            onChange={changeMode}
          />
        )}

        {specific && timing.cadence === 'weekly' && (
          <ChoiceGroup
            label="Day of the week"
            value={(timing.timingValue as number[] | null)?.[0] ?? null}
            choices={WEEK_ORDER.map((d) => ({ value: d, label: WEEKDAYS_SHORT[d], ariaLabel: WEEKDAYS[d] }))}
            onChange={(d) => setValue([d])}
          />
        )}

        {specific && timing.cadence === 'monthly' && (
          <label className="field">
            <span className="field__label">Day of the month</span>
            <span className="select-wrap">
              <select value={String(timing.timingValue ?? 1)} onChange={(e) => setValue(Number(e.target.value))}>
                {MONTH_DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {monthDayLabel(d)}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={18} />
            </span>
          </label>
        )}

        {specific && timing.cadence === 'seasonal' && (
          <ChoiceGroup
            label="Season"
            value={(timing.timingValue as SeasonName[] | null)?.[0] ?? null}
            choices={SEASONS.map((s) => ({ value: s, label: SEASON_LABEL[s] }))}
            onChange={(s) => setValue([s])}
          />
        )}

        {specific && timing.cadence === 'yearly' && (
          <ChoiceGroup
            label="Month"
            value={timing.timingValue as number | null}
            columns={6}
            choices={MONTHS_SHORT.map((m, i) => ({ value: i, label: m, ariaLabel: MONTHS[i] }))}
            onChange={(m) => setValue(m)}
          />
        )}

        {info && (
          <div className="info-card">
            <p className="info-card__title">{info.title}</p>
            <p className="info-card__body">{info.body}</p>
          </div>
        )}

        <label className="field">
          <span className="field__label">Notes (optional)</span>
          <textarea
            className="text-input textarea"
            value={notes}
            placeholder="Supplies, tips, or reminders"
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="show-up" aria-live="polite">
          <p className="show-up__title">How this will show up</p>
          <p className="show-up__text">{previewText(timing)}</p>
          {specific && timing.cadence === 'monthly' && (
            <dl className="runway">
              {MONTHLY_RUNWAY.map((r) => (
                <div key={r.when} className="runway__row">
                  <dt>{r.when}</dt>
                  <dd>
                    {'tag' in r ? (
                      <span className={r.tag === 'Priority' ? 'tag tag--priority' : 'tag'}>
                        <span className="tag__dot" aria-hidden />
                        {r.tag}
                      </span>
                    ) : (
                      r.what
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {existing && (
          <Toggle
            title="Pause this task"
            hint="Skips it with no penalty. Good for trips or off-season."
            checked={paused}
            onChange={setPaused}
          />
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet__spacer" />
        {existing && (
          <button type="button" className="delete-text" onClick={() => setConfirmDelete(true)}>
            Delete task
          </button>
        )}
        <div className="sheet__actions">
          <button type="button" className="cancel-button" onClick={() => goBack(navigate, '/plan')}>
            Cancel
          </button>
          <button type="submit" className="save-button" disabled={saving}>
            {existing ? 'Save changes' : 'Save task'}
          </button>
        </div>
      </form>

      <ActionSheet
        open={confirmDelete}
        title={`Delete “${existing?.name}”?`}
        message="It comes off your plan. Tasks you already checked off still count in Analysis. To stop it for a while instead, pause it."
        onClose={() => setConfirmDelete(false)}
        actions={[
          {
            label: 'Delete task',
            tone: 'clay',
            onSelect: async () => {
              await deleteTask(existing!.id);
              navigate('/plan', { replace: true });
            },
          },
        ]}
      />
    </div>
  );
}
