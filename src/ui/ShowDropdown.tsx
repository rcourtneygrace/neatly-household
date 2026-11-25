import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import './ShowDropdown.css';

export interface ShowOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  label?: string;
  value: string;
  options: ShowOption[];
  onChange: (value: string) => void;
}

/** The "Show" filter dropdown (Records tab: show open, Figma 6:207). */
export function ShowDropdown({ label = 'Show', value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="show-dropdown" ref={wrapRef}>
      <span className="show-dropdown__label" id={`${listId}-label`}>
        {label}
      </span>
      <button
        type="button"
        className={open ? 'show-dropdown__button is-open' : 'show-dropdown__button'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listId}-label ${listId}-value`}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${listId}-value`}>{current?.label}</span>
        <Icon name="chevron-down" size={20} />
      </button>
      {open && (
        <ul className="show-dropdown__list" role="listbox" aria-labelledby={`${listId}-label`}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className="show-dropdown__option"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.count !== undefined && <span className="show-dropdown__count">{o.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
