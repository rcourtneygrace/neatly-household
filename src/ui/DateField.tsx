import { Icon } from './Icon';
import { weekdayDate, type Day } from '../domain/dates';
import './date-field.css';

/**
 * A date field that looks like the text fields. iPhone Safari draws its own date box (shorter,
 * text off-center), so we draw the date ourselves and lay the real date input over it,
 * invisible: a tap still opens the iPhone date wheel.
 */
export function DateField({
  value,
  onChange,
  min,
  disabled,
  placeholder = 'Choose a date',
  label,
}: {
  value: Day | '';
  onChange: (day: Day | '') => void;
  min?: Day;
  disabled?: boolean;
  placeholder?: string;
  /** For screen readers when the visible label is elsewhere */
  label?: string;
}) {
  return (
    <span className={disabled ? 'date-box is-disabled' : 'date-box'}>
      <span className={value ? 'date-box__face' : 'date-box__face is-empty'} aria-hidden>
        {value ? weekdayDate(value) : placeholder}
      </span>
      <Icon name="calendar" size={18} className="date-box__icon" />
      <input
        className="date-box__native"
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
