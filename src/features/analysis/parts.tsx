import type { ReactNode } from 'react';
import { Icon } from '../../ui';
import { FEELING_LABEL, type Feeling } from '../../domain/analysis';

/** Department ring (Figma 16:3218): track plus progress arc. No number: it is a feeling, not a grade. */
export function Ring({ score, feeling, size = 76 }: { score: number | null; feeling: Feeling | null; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <span className={`ring ring--${feeling ?? 'none'}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        {pct > 0 && (
          <circle
            className="ring__progress"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
    </span>
  );
}

export function FeelingText({ feeling }: { feeling: Feeling | null }) {
  return <span className={`feeling feeling--${feeling ?? 'none'}`}>{feeling ? FEELING_LABEL[feeling] : 'Not enough yet'}</span>;
}

export function SuggestionNote({ children }: { children: ReactNode }) {
  return (
    <div className="tip-note">
      <Icon name="leaf" size={20} />
      <p>{children}</p>
    </div>
  );
}

export function SectionTitle({ title, subtitle, id }: { title: string; subtitle?: string; id?: string }) {
  return (
    <div className="an-section-title">
      <h2 id={id}>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

