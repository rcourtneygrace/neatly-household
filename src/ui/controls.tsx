import { useId, type KeyboardEvent, type ReactNode } from 'react';
import './controls.css';

/** On/off switch (Figma: "Pause this task", "Clear items when checked"). */
export function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <span className="toggle-row__title" id={`${id}-t`}>
          {title}
        </span>
        {hint && (
          <span className="toggle-row__hint" id={`${id}-h`}>
            {hint}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-t`}
        aria-describedby={hint ? `${id}-h` : undefined}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

export interface Choice<T> {
  value: T;
  label: ReactNode;
  /** Spoken label when `label` is short (e.g. "Wed" → "Wednesday"). */
  ariaLabel?: string;
}

/**
 * A row (or grid) of choice buttons with a teal selected state: Cadence, Timing,
 * days of the week, seasons and months. Behaves as a radio group.
 */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  choices,
  onChange,
  columns,
}: {
  label: string;
  value: T | null;
  choices: Choice<T>[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  const id = useId();
  const selectedIndex = choices.findIndex((c) => c.value === value);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + choices.length) % choices.length;
    onChange(choices[next].value);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="choice-field">
      <span className="field__label" id={id}>
        {label}
      </span>
      <div
        className="choice-group"
        role="radiogroup"
        aria-labelledby={id}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
        data-grid={columns ? '' : undefined}
      >
        {choices.map((c, i) => {
          const selected = c.value === value;
          return (
            <button
              key={String(c.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c.ariaLabel}
              tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
              className={selected ? 'choice is-selected' : 'choice'}
              onClick={() => onChange(c.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
