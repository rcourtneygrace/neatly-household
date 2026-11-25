import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { saveRoutineSteps, useRoutine } from '../../data/tasks';
import type { RoutineTemplate } from '../../data/types';
import '../records/record-form.css';
import './plan.css';
import './routine.css';

/** Edit Opening / Edit Closing (Figma 16:1876). Steps can be renamed, added, removed and dragged into order. */
export function RoutineEditScreen() {
  const { type } = useParams();
  const valid = type === 'opening' || type === 'closing';
  const routine = useRoutine(valid ? type : 'opening');
  if (!valid) return <Navigate to="/plan" replace />;
  if (!routine) return null;
  return <RoutineEditor key={routine.id} routine={routine} />;
}

interface Step {
  key: number;
  text: string;
}
let stepKey = 0;

function RoutineEditor({ routine }: { routine: RoutineTemplate }) {
  const navigate = useNavigate();
  const isOpening = routine.type === 'opening';
  const [steps, setSteps] = useState<Step[]>(() =>
    [...routine.steps].sort((a, b) => a.order - b.order).map((s) => ({ key: ++stepKey, text: s.text })),
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing !== null) inputRef.current?.focus();
  }, [editing]);

  const move = (key: number, to: number) =>
    setSteps((ss) => {
      const from = ss.findIndex((s) => s.key === key);
      if (from === to || to < 0 || to >= ss.length) return ss;
      const next = [...ss];
      const [s] = next.splice(from, 1);
      next.splice(to, 0, s);
      return next;
    });

  /* Drag by the handle: the row follows the finger and swaps places with the row it crosses. */
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>, key: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditing(null);
    setDragKey(key);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLButtonElement>, key: number) => {
    if (dragKey !== key) return;
    const y = e.clientY;
    const keys = steps.map((s) => s.key);
    for (let i = 0; i < keys.length; i++) {
      const el = rowRefs.current.get(keys[i]);
      if (!el || keys[i] === key) continue;
      const r = el.getBoundingClientRect();
      if (y > r.top && y < r.bottom) {
        move(key, i);
        break;
      }
    }
  };
  const onHandleUp = () => setDragKey(null);

  const onHandleKey = (e: KeyboardEvent, key: number, index: number, text: string) => {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
    if (to === null || to < 0 || to >= steps.length) return;
    e.preventDefault();
    move(key, to);
    setAnnounce(`${text || 'Step'} moved to position ${to + 1} of ${steps.length}`);
  };

  const addStep = () => {
    const s = { key: ++stepKey, text: '' };
    setSteps((ss) => [...ss, s]);
    setEditing(s.key);
  };

  const finishEditing = () => {
    setSteps((ss) => ss.filter((s) => s.key !== editing || s.text.trim()));
    setEditing(null);
  };

  const onSave = async () => {
    await saveRoutineSteps(
      routine.type,
      steps.map((s) => s.text),
    );
    goBack(navigate, '/plan');
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/plan')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">{isOpening ? 'Edit Opening' : 'Edit Closing'}</h1>
          <p className="pushed__subtitle">Steps appear in this order each {isOpening ? 'morning' : 'evening'}</p>
        </div>
      </header>

      {steps.length > 0 ? (
        <ol className="steps-card">
          {steps.map((s, i) => (
            <li
              key={s.key}
              ref={(el) => {
                if (el) rowRefs.current.set(s.key, el);
                else rowRefs.current.delete(s.key);
              }}
              className={dragKey === s.key ? 'step-row is-dragging' : 'step-row'}
            >
              <button
                type="button"
                className="step-row__handle"
                aria-label={`Move ${s.text || 'step'}. Use the up and down arrow keys.`}
                onPointerDown={(e) => onHandleDown(e, s.key)}
                onPointerMove={(e) => onHandleMove(e, s.key)}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onKeyDown={(e) => onHandleKey(e, s.key, i, s.text)}
              >
                <Icon name="drag" size={20} />
              </button>

              {editing === s.key ? (
                <>
                  <input
                    ref={inputRef}
                    className="step-row__input"
                    value={s.text}
                    placeholder="Describe the step"
                    aria-label={`Step ${i + 1}`}
                    enterKeyHint="done"
                    onChange={(e) => setSteps((ss) => ss.map((x) => (x.key === s.key ? { ...x, text: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        finishEditing();
                      }
                    }}
                    onBlur={finishEditing}
                  />
                  <button
                    type="button"
                    className="step-row__action"
                    aria-label={`Remove ${s.text || 'step'}`}
                    // pointerdown fires before the input's blur, so the remove wins
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setSteps((ss) => ss.filter((x) => x.key !== s.key));
                      setEditing(null);
                    }}
                    onClick={() => {
                      setSteps((ss) => ss.filter((x) => x.key !== s.key));
                      setEditing(null);
                    }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </>
              ) : (
                <>
                  <span className="step-row__text">{s.text}</span>
                  <button
                    type="button"
                    className="step-row__action"
                    aria-label={`Edit ${s.text}`}
                    onClick={() => setEditing(s.key)}
                  >
                    <Icon name="pencil" size={18} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="steps-empty">No steps yet. Add the few things that start your {isOpening ? 'day' : 'evening'}.</p>
      )}

      <button type="button" className="add-step" onClick={addStep}>
        <Icon name="plus" size={20} />
        Add step
      </button>

      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>

      <div className="pushed__spacer" />
      <div className="pushed__actions">
        <button type="button" className="cancel-button" onClick={() => goBack(navigate, '/plan')}>
          Cancel
        </button>
        <button type="button" className="save-button" onClick={onSave}>
          Save changes
        </button>
      </div>
    </main>
  );
}
