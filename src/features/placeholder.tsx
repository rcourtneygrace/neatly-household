import { PageHeader } from '../ui';
import { useHousehold } from '../data/hooks';

/** Temporary stand-in for tabs that are built in later phases. */
export function PlaceholderScreen({ title, phase }: { title: string; phase: string }) {
  const household = useHousehold();
  return (
    <main className="screen">
      <PageHeader title={title} householdName={household?.name} />
      <div className="screen__body">
        <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>Coming in {phase}.</p>
      </div>
    </main>
  );
}
