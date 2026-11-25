import type { CSSProperties } from 'react';

const files = import.meta.glob('../assets/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

const icons: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  icons[path.split('/').pop()!.replace('.svg', '')] = url;
}

export type IconName =
  | 'settings'
  | 'search'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'phone'
  | 'plus'
  | 'close'
  | 'tab-today'
  | 'tab-plan'
  | 'tab-records'
  | 'tab-analysis'
  | (string & {});

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Text alternative. Leave empty for decorative icons next to a visible label. */
  label?: string;
}

/** Renders a Figma icon as a CSS mask so it takes the surrounding text color. */
export function Icon({ name, size = 24, className, label }: IconProps) {
  const url = icons[name];
  if (!url && import.meta.env.DEV) console.warn(`Missing icon: ${name}`);
  const style = { '--icon-src': `url("${url}")`, '--icon-size': `${size}px` } as CSSProperties;
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
