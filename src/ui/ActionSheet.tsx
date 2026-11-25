import { useEffect, useRef, type ReactNode } from 'react';
import './ActionSheet.css';

export interface SheetAction {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'clay';
}

interface Props {
  open: boolean;
  title?: string;
  message?: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
  cancelLabel?: string;
}

/** A calm bottom sheet of choices (photo source, delete confirm). Never a browser dialog. */
export function ActionSheet({ open, title, message, actions, onClose, cancelLabel = 'Cancel' }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="action-sheet" role="presentation" onClick={onClose}>
      <div
        className="action-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || message) && (
          <div className="action-sheet__intro">
            {title && <p className="action-sheet__title">{title}</p>}
            {message && <p className="action-sheet__message">{message}</p>}
          </div>
        )}
        {actions.map((a, i) => (
          <button
            key={a.label}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            className={a.tone === 'clay' ? 'action-sheet__action is-clay' : 'action-sheet__action'}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            {a.label}
          </button>
        ))}
        <button type="button" className="action-sheet__action action-sheet__cancel" onClick={onClose}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
