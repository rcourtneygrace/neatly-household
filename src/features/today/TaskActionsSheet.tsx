import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SKIP_REASONS } from '../../data/today';
import type { Cadence } from '../../data/types';
import type { TodayItem } from '../../domain/schedule';
import { plainMeta } from '../../domain/schedule';
import './task-sheet.css';

const SKIP_LABEL: Record<Cadence, string> = {
  daily: 'Skip today',
  weekly: 'Skip this week',
  monthly: 'Skip this month',
  seasonal: 'Skip this season',
  yearly: 'Skip this year',
};

/** A bottom sheet that closes on Escape and on a tap outside. */
function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="task-sheet" role="presentation" onClick={onClose}>
      <div
        ref={panel}
        className="task-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" aria-hidden />
        {children}
      </div>
    </div>
  );
}

/**
 * Task actions (Build Your Day doc): opens when a task row is tapped anywhere but its checkbox.
 * Name, notes, then Push to a later date, Skip <cycle>, Edit task, and Cancel.
 */
export function TaskActionsSheet({
  item,
  department,
  onClose,
  onPush,
  onSkip,
  onEdit,
}: {
  item: TodayItem | null;
  department: string;
  onClose: () => void;
  onPush: (i: TodayItem) => void;
  onSkip: (i: TodayItem) => void;
  onEdit: (i: TodayItem) => void;
}) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [item?.task.id]);
  const run = (fn: (i: TodayItem) => void) => () => {
    if (!item) return;
    onClose();
    fn(item);
  };
  return (
    <Sheet open={!!item} onClose={onClose} labelledBy="task-sheet-title">
      {item && (
        <>
          <h2 id="task-sheet-title" className="task-sheet__title">
            {item.task.name}
          </h2>
          <p className="task-sheet__meta">{plainMeta(item.task, department)}</p>
          {item.task.notes && (
            <div className="task-sheet__notes">
              <p className={more ? undefined : 'is-clamped'}>{item.task.notes}</p>
              {!more && item.task.notes.length > 160 && (
                <button type="button" className="task-sheet__more" onClick={() => setMore(true)}>
                  Show more
                </button>
              )}
            </div>
          )}
          <div className="task-sheet__actions">
            <button type="button" className="task-sheet__action" onClick={run(onPush)}>
              Push to a later date
            </button>
            <button type="button" className="task-sheet__action" onClick={run(onSkip)}>
              {SKIP_LABEL[item.task.cadence]}
            </button>
            <button type="button" className="task-sheet__action" onClick={run(onEdit)}>
              Edit task
            </button>
          </div>
          <button type="button" className="task-sheet__quiet" onClick={onClose}>
            Cancel
          </button>
        </>
      )}
    </Sheet>
  );
}

/** "Why are you skipping it?": one tap per reason finishes the skip. Reasons are optional. */
export function SkipSheet({
  item,
  onClose,
  onSkip,
}: {
  item: TodayItem | null;
  onClose: () => void;
  onSkip: (i: TodayItem, reason: string | null) => void;
}) {
  const [other, setOther] = useState<string | null>(null);
  useEffect(() => setOther(null), [item?.task.id]);
  const finish = (reason: string | null) => {
    if (!item) return;
    onClose();
    onSkip(item, reason);
  };
  return (
    <Sheet open={!!item} onClose={onClose} labelledBy="skip-sheet-title">
      <h2 id="skip-sheet-title" className="task-sheet__title">
        Why are you skipping it?
      </h2>
      {item && <p className="task-sheet__meta">{item.task.name}</p>}
      <div className="task-sheet__actions">
        {SKIP_REASONS.map((r) =>
          r.label === 'Other' && other !== null ? (
            <form
              key="other"
              className="skip-other"
              onSubmit={(e) => {
                e.preventDefault();
                finish(other.trim() ? `Other: ${other.trim()}` : 'Other');
              }}
            >
              <input
                className="text-input"
                value={other}
                placeholder="Add a few words (optional)"
                aria-label="Other reason"
                autoFocus
                enterKeyHint="done"
                onChange={(e) => setOther(e.target.value)}
              />
              <button type="submit" className="save-button">
                Skip
              </button>
            </form>
          ) : (
            <button
              key={r.label}
              type="button"
              className="task-sheet__action"
              onClick={() => (r.label === 'Other' ? setOther('') : finish(r.label))}
            >
              {r.label}
            </button>
          ),
        )}
      </div>
      <button type="button" className="task-sheet__quiet" onClick={() => finish(null)}>
        Skip without a reason
      </button>
      <button type="button" className="task-sheet__quiet" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
