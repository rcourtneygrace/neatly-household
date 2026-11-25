import type { NavigateFunction } from 'react-router-dom';

/**
 * Go back one screen, or to `fallback` when there is nothing to go back to
 * (the app was opened straight onto this screen, e.g. from a home-screen launch).
 */
export function goBack(navigate: NavigateFunction, fallback: string): void {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) navigate(-1);
  else navigate(fallback, { replace: true });
}
