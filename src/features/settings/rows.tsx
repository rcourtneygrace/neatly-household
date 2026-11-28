import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui';
import './rows.css';

/** A titled card of rows, with an optional note under it (grouped-list settings). */
export function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="set-group" aria-labelledby={id}>
      <h2 className="set-group__title" id={id}>
        {title}
      </h2>
      <div className="set-group__card">{children}</div>
      {footer && <p className="set-group__footer">{footer}</p>}
    </section>
  );
}

function Body({ icon, title, detail, tone }: { icon: string; title: ReactNode; detail?: ReactNode; tone?: 'clay' }) {
  return (
    <>
      <span className={tone === 'clay' ? 'set-row__icon set-row__icon--clay' : 'set-row__icon'} aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="set-row__text">
        <span className={tone === 'clay' ? 'set-row__title set-row__title--clay' : 'set-row__title'}>{title}</span>
        {detail && <span className="set-row__detail">{detail}</span>}
      </span>
    </>
  );
}

export function RowLink({ icon, title, detail, to }: { icon: string; title: string; detail?: ReactNode; to: string }) {
  return (
    <Link to={to} className="set-row">
      <Body icon={icon} title={title} detail={detail} />
      <Icon name="chevron-right" size={18} className="set-row__chevron" />
    </Link>
  );
}

export function RowButton({
  icon,
  title,
  detail,
  onClick,
  tone,
  disabled,
}: {
  icon: string;
  title: string;
  detail?: ReactNode;
  onClick: () => void;
  tone?: 'clay';
  disabled?: boolean;
}) {
  return (
    <button type="button" className="set-row" onClick={onClick} disabled={disabled}>
      <Body icon={icon} title={title} detail={detail} tone={tone} />
    </button>
  );
}

/** A row that only shows information. */
export function RowInfo({ icon, title, detail }: { icon: string; title: string; detail?: ReactNode }) {
  return (
    <div className="set-row set-row--info">
      <Body icon={icon} title={title} detail={detail} />
    </div>
  );
}

export function RowToggle({
  icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: string;
  title: string;
  detail?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="set-row set-row--info">
      <span className="set-row__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="set-row__text">
        <span className="set-row__title" id={`${id}-t`}>
          {title}
        </span>
        {detail && (
          <span className="set-row__detail" id={`${id}-d`}>
            {detail}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-t`}
        aria-describedby={detail ? `${id}-d` : undefined}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

/** A row holding a text field (e.g. the household name). */
export function RowField({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <label className="set-row set-row--field">
      <span className="set-row__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="set-row__text">
        <span className="set-row__detail">{label}</span>
        {children}
      </span>
    </label>
  );
}
