import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import './components.css';

export { Icon } from './Icon';

export function Wordmark() {
  return (
    <div className="wordmark" aria-label="Neatly Household">
      <span className="wordmark__dark" aria-hidden>
        NEATLY.
      </span>
      <span className="wordmark__light" aria-hidden>
        HOUSEHOLD
      </span>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  householdName?: string;
  subtitle?: string;
  showSettings?: boolean;
  showWordmark?: boolean;
}

/** Header used by Records, Plan and Analysis: wordmark, household label, big title, gear. */
export function PageHeader({ title, householdName, subtitle, showSettings = true, showWordmark = true }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header>
      {showWordmark && <Wordmark />}
      <div className="page-header">
        {householdName && (
          <div className="page-header__household">
            <span className="page-header__household-initial" aria-hidden>
              {householdName.trim().charAt(0).toUpperCase()}
            </span>
            <span className="page-header__household-name">{householdName}</span>
          </div>
        )}
        <div className="page-header__row">
          <h1 className="page-header__title">{title}</h1>
          {showSettings && (
            <button type="button" className="icon-button" onClick={() => navigate('/settings')}>
              <Icon name="settings" label="Settings" />
            </button>
          )}
        </div>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}

export function SectionHeader({ title, count, className }: { title: string; count?: string; className?: string }) {
  return (
    <div className={className ? `section-header ${className}` : 'section-header'}>
      <h2 className="section-header__title">{title}</h2>
      {count && <span className="section-header__count">{count}</span>}
    </div>
  );
}

interface PrimaryButtonProps {
  children: ReactNode;
  icon?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  compact?: boolean;
  disabled?: boolean;
}

export function PrimaryButton({ children, icon, onClick, type = 'button', compact, disabled }: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={compact ? 'primary-button primary-button--compact' : 'primary-button'}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} size={24} />}
      {children}
    </button>
  );
}

export function CallButton({ phone, name }: { phone: string; name: string }) {
  const tel = phone.replace(/[^\d+]/g, '');
  return (
    <a className="call-button" href={`tel:${tel}`} aria-label={`Call ${name}`}>
      <Icon name="phone" size={20} />
    </a>
  );
}

const TABS = [
  { to: '/today', label: 'Today', icon: 'tab-today' },
  { to: '/plan', label: 'Plan', icon: 'tab-plan' },
  { to: '/records', label: 'Records', icon: 'tab-records' },
  { to: '/analysis', label: 'Analysis', icon: 'tab-analysis' },
];

export function NavBar() {
  return (
    <nav className="nav-bar" aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className="nav-bar__tab">
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
