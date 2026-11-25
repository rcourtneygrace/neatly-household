import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { goBack } from '../../ui/goBack';
import { updateHousehold, useHousehold } from '../../data/hooks';
import type { Household, SeasonName, SeasonPreset } from '../../data/types';
import {
  MONTHS,
  SEASONS,
  SEASON_LABEL,
  SEASON_PRESETS,
  daysInMonth,
  formatMonthDay,
  presetFor,
  seasonRanges,
  seasonsInOrder,
} from '../../domain/tasks';
import '../records/record-form.css';
import '../plan/plan.css';
import './plan-settings.css';

/** Seasons (Figma 16:2695): Calendar, Weather or Custom start dates. */
export function SeasonsScreen() {
  const household = useHousehold();
  if (!household) return null;
  return <SeasonsForm key={household.id} household={household} />;
}

const PRESET_LABEL: Record<SeasonPreset, string> = { calendar: 'Calendar', weather: 'Weather', custom: 'Custom' };

function SeasonsForm({ household }: { household: Household }) {
  const navigate = useNavigate();
  const [starts, setStarts] = useState(household.seasonStartDates);
  const [preset, setPreset] = useState<SeasonPreset>(household.seasonPreset ?? presetFor(household.seasonStartDates));
  const [open, setOpen] = useState<SeasonName | null>(null);
  const [error, setError] = useState<string>();

  const ranges = seasonRanges(starts);

  const choosePreset = (p: SeasonPreset) => {
    setPreset(p);
    setError(undefined);
    if (p !== 'custom') setStarts(SEASON_PRESETS[p]);
  };

  const setStart = (season: SeasonName, month: number, day: number) => {
    const d = Math.min(day, daysInMonth(month));
    const next = { ...starts, [season]: `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    setStarts(next);
    setPreset('custom');
    setError(undefined);
  };

  const onSave = async () => {
    if (!seasonsInOrder(starts)) {
      setError('Seasons need to follow each other through the year: Spring, then Summer, Fall and Winter.');
      return;
    }
    await updateHousehold({ seasonStartDates: starts, seasonPreset: presetFor(starts) });
    goBack(navigate, '/settings/plan');
  };

  return (
    <main className="pushed">
      <header className="pushed__header">
        <button type="button" className="pushed__back" onClick={() => goBack(navigate, '/settings/plan')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div>
          <h1 className="pushed__title">Seasons</h1>
          <p className="pushed__subtitle">When each season begins in your home</p>
        </div>
      </header>

      <div className="segmented" role="radiogroup" aria-label="Season dates">
        {(['calendar', 'weather', 'custom'] as SeasonPreset[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            className={preset === p ? 'segmented__item is-selected' : 'segmented__item'}
            onClick={() => choosePreset(p)}
          >
            {PRESET_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="seasons__hint">
        Calendar follows the solstices and equinoxes. Weather uses the 1st of Mar, Jun, Sep and Dec. Custom is yours to set.
      </p>

      <div className="season-bar" aria-hidden>
        {ranges.map((r) => (
          <span
            key={r.season}
            className={`season-bar__seg season-bar__seg--${r.season}${open === r.season ? ' is-open' : ''}`}
            style={{ flexGrow: Math.max(r.days, 1) }}
          >
            <span className="season-bar__label">{SEASON_LABEL[r.season]}</span>
          </span>
        ))}
      </div>

      <ul className="season-list">
        {ranges.map((r, i) => {
          const isOpen = open === r.season;
          const [m, d] = r.start.split('-').map(Number);
          const prev = SEASONS[(i + 3) % 4];
          return (
            <li key={r.season} className={isOpen ? 'season-card is-open' : 'season-card'}>
              <button
                type="button"
                className="season-card__head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.season)}
              >
                <span className={`season-dot season-dot--${r.season}`} aria-hidden />
                <span className="season-card__text">
                  <span className="season-card__name">{SEASON_LABEL[r.season]}</span>
                  <span className="season-card__range">
                    Begins {formatMonthDay(r.start)} · until {formatMonthDay(r.end)}
                  </span>
                </span>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} />
              </button>
              {isOpen && (
                <div className="season-card__body">
                  <div className="season-card__selects">
                    <label className="field">
                      <span className="field__label">Month</span>
                      <span className="select-wrap">
                        <select value={m - 1} onChange={(e) => setStart(r.season, Number(e.target.value), d)}>
                          {MONTHS.map((name, mi) => (
                            <option key={name} value={mi}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevron-down" size={18} />
                      </span>
                    </label>
                    <label className="field">
                      <span className="field__label">Day</span>
                      <span className="select-wrap">
                        <select value={d} onChange={(e) => setStart(r.season, m - 1, Number(e.target.value))}>
                          {Array.from({ length: daysInMonth(m - 1) }, (_, k) => k + 1).map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevron-down" size={18} />
                      </span>
                    </label>
                  </div>
                  <p className="season-card__note">
                    {SEASON_LABEL[prev]} will end the day before. Tasks set to {SEASON_LABEL[r.season]} move with it.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="seasons__notice">
        Seasonal tasks use these dates. If you move a start date, tasks already on your plan keep their place this season
        and follow the new dates from the next one.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="pushed__spacer" />
      <div className="pushed__actions">
        <button type="button" className="save-button" onClick={onSave}>
          Save seasons
        </button>
        <button type="button" className="reset-button" onClick={() => choosePreset('calendar')}>
          Reset to calendar seasons
        </button>
      </div>
    </main>
  );
}
