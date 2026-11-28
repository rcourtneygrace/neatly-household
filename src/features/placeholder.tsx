import { PageHeader } from '../ui';

/** Temporary stand-in for tabs that are built in later phases. */
export function PlaceholderScreen({ title, phase }: { title: string; phase: string }) {
  return (
    <main className="screen">
      <PageHeader title={title} />
      <div className="screen__body">
        <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>Coming in {phase}.</p>
      </div>
    </main>
  );
}
