import { useCallback, useState } from 'react';
import type { Suggestion } from '../../domain/analysis';

export function suggestionKey(s: Suggestion) {
  return `${s.task.id}:${s.kind}:${s.to}`;
}

const DISMISS_KEY = 'neatly.dismissedSuggestions';
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Suggestions the person said "Keep it…" to stay hidden on this phone. "Not now" only hides
 * one until the app is opened again.
 */
export function useDismissed() {
  const [kept, setKept] = useState<string[]>(readDismissed);
  const [later, setLater] = useState<string[]>([]);
  const keep = useCallback((key: string) => {
    const next = [...readDismissed(), key];
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* private mode: keep it for this session only */
    }
    setKept(next);
  }, []);
  const notNow = useCallback((key: string) => setLater((l) => [...l, key]), []);
  const isHidden = useCallback((key: string) => kept.includes(key) || later.includes(key), [kept, later]);
  return { keep, notNow, isHidden };
}
