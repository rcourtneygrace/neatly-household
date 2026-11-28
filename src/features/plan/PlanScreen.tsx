import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, PageHeader, PrimaryButton } from '../../ui';
import { ShowDropdown } from '../../ui/ShowDropdown';
import { useDepartments, useRoutines, useTasks } from '../../data/tasks';
import { loadSuggestedTasks } from '../../data/suggestedTasks';
import type { Cadence, Task } from '../../data/types';
import { CADENCES, CADENCE_LABEL, scheduleLabel, sortTasks, stepCountLabel, taskCountLabel } from '../../domain/tasks';
import './plan.css';

type Filter = 'all' | Cadence;

/** Plan overview (Figma 16:2341, Weekly filter 16:2861). */
export function PlanScreen() {
  const tasks = useTasks();
  const departments = useDepartments();
  const routines = useRoutines();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const filter = (CADENCES.includes(params.get('show') as Cadence) ? params.get('show') : 'all') as Filter;

  const options = useMemo(
    () => [
      { value: 'all', label: 'All tasks', count: tasks?.length ?? 0 },
      ...CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c], count: tasks?.filter((t) => t.cadence === c).length ?? 0 })),
    ],
    [tasks],
  );

  const groups = useMemo(() => {
    if (!tasks || !departments) return [];
    const shown = filter === 'all' ? tasks : tasks.filter((t) => t.cadence === filter);
    return departments
      .map((d) => ({ department: d, tasks: sortTasks(shown.filter((t) => t.departmentId === d.id)) }))
      .filter((g) => g.tasks.length > 0);
  }, [tasks, departments, filter]);

  const deptName = (id: string) => departments?.find((d) => d.id === id)?.name ?? '';

  if (!tasks || !departments) return <main className="screen" />;

  return (
    <main className="screen plan-screen">
      <PageHeader title="Plan" />

      <div className="screen__body plan-routines">
        <RoutineCard type="opening" steps={routines?.opening?.steps.length ?? 0} />
        <RoutineCard type="closing" steps={routines?.closing?.steps.length ?? 0} />
      </div>

      {tasks.length > 0 ? (
        <>
          <div className="screen__body plan-controls">
            <ShowDropdown
              value={filter}
              options={options}
              onChange={(v) => setParams(v === 'all' ? {} : { show: v }, { replace: true })}
            />
          </div>

          <div className="screen__body plan-list">
            {groups.length === 0 && (
              <p className="plan-empty">No {CADENCE_LABEL[filter as Cadence].toLowerCase()} tasks yet.</p>
            )}
            {groups.map((g) => (
              <section key={g.department.id} className="plan-group" aria-labelledby={`dept-${g.department.id}`}>
                <div className="plan-group__header">
                  <h2 id={`dept-${g.department.id}`}>{g.department.name}</h2>
                  <span>{taskCountLabel(g.tasks.length)}</span>
                </div>
                <ul className="plan-group__rows">
                  {g.tasks.map((t) => (
                    <li key={t.id}>
                      <TaskRow task={t} department={deptName(t.departmentId)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="screen__body plan-start">
          <h2 className="plan-start__title">No tasks yet</h2>
          <p className="plan-start__text">
            Add your own, or start with a set of suggested tasks for each part of the house. You can change or delete any of
            them.
          </p>
          <button
            type="button"
            className="outline-button outline-button--wide"
            disabled={adding}
            onClick={async () => {
              setAdding(true);
              await loadSuggestedTasks();
              setAdding(false);
            }}
          >
            Add suggested tasks
          </button>
        </div>
      )}

      <div className="records-add">
        <PrimaryButton
          icon="plus"
          onClick={() => navigate(filter === 'all' ? '/plan/tasks/new' : `/plan/tasks/new?cadence=${filter}`)}
        >
          Add task
        </PrimaryButton>
      </div>
    </main>
  );
}

function RoutineCard({ type, steps }: { type: 'opening' | 'closing'; steps: number }) {
  const title = type === 'opening' ? 'Opening' : 'Closing';
  return (
    <Link to={`/plan/routine/${type}`} className="routine-card">
      <span className="routine-card__icon">
        <Icon name={type === 'opening' ? 'sun' : 'moon'} size={26} />
      </span>
      <span className="routine-card__text">
        <span className="routine-card__title">{title}</span>
        <span className="routine-card__meta">
          <span className="routine-card__required">Required</span> · {steps ? stepCountLabel(steps) : 'No steps yet'}
        </span>
      </span>
      <Icon name="chevron-right" size={22} className="routine-card__chevron" />
    </Link>
  );
}

function TaskRow({ task, department }: { task: Task; department: string }) {
  return (
    <Link to={`/plan/tasks/${task.id}`} className="task-row">
      <span className="task-row__text">
        <span className="task-row__name">{task.name}</span>
        <span className="task-row__meta">
          <span className="task-row__dept">{department}</span>
          <span>{scheduleLabel(task)}</span>
          {task.paused && <span className="task-row__paused">Paused</span>}
        </span>
      </span>
      <span className="task-row__chevron">
        <Icon name="chevron-right" size={22} />
      </span>
    </Link>
  );
}
