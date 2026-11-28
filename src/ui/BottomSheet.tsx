import { useEffect, useRef, type ReactNode } from 'react';
import '../features/today/task-sheet.css';

/** A bottom sheet that closes on Escape and on a tap outside. */
export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus the sheet itself: focusing a date field would pop open the iPhone picker
    panel.current?.focus();
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
        tabIndex={-1}
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

