import type { Day } from '../../domain/dates';
import { rowMeta, type TodayItem } from '../../domain/schedule';

/** Status tag: always a dot and a word, never color alone. */
export function TagPill({ tag }: { tag: TodayItem['tag'] }) {
  if (!tag) return null;
  const label = tag === 'priority' ? 'Priority' : tag === 'today' ? 'Today' : 'Heads up';
  return (
    <span className={tag === 'priority' ? 'tag tag--priority' : 'tag'}>
      <span className="tag__dot" aria-hidden />
      {label}
    </span>
  );
}

/** "Kitchen · Oct 17" with the date or day emphasised; Priority rows in clay. */
export function MetaLine({ item, department, T }: { item: TodayItem; department: string; T: Day }) {
  const m = rowMeta(item, department, T);
  return (
    <span className={m.clay ? 'row-text__meta is-clay' : 'row-text__meta'}>
      {m.text}
      {m.emphasis && <strong className={item.tag ? 'is-clay' : undefined}>{m.emphasis}</strong>}
    </span>
  );
}

