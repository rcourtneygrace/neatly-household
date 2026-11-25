import { useState } from 'react';
import { ActionSheet } from '../../ui/ActionSheet';
import { APP_URL, inviteLink, joinHousehold, leaveHousehold, parseInvite, startSharing, syncNow, useSyncState } from '../../data/sync';

/** Hand a link to the iOS share sheet, or copy it where sharing isn't available. */
async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return 'copied';
}

function ago(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Synced just now';
  if (min < 60) return `Synced ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Synced ${h} hr ago`;
  return `Synced ${new Date(iso).toLocaleDateString()}`;
}

const ERRORS: Record<string, string> = {
  offline: "You're offline. Changes will sync when you're back online.",
  'not allowed': 'This invite no longer works. Ask for a new one.',
  failed: "Couldn't sync just now. Neatly will try again shortly.",
  empty: "That invite didn't lead to a household. Check the link and try again.",
};

/**
 * Settings: share this household with the people you live with (one plan, kept in step on
 * every phone), or join someone else's.
 */
export function SharingSection({ onStatus }: { onStatus: (s: string | undefined) => void }) {
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [confirmJoin, setConfirmJoin] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  if (!sync) return null;

  const sendInvite = async (key: string) => {
    const r = await shareLink(
      'Join our household on Neatly',
      'Join our household on Neatly. Open this link on your phone:',
      inviteLink(key),
    );
    if (r === 'copied') onStatus('Invite link copied. Paste it into a message.');
  };

  const invite = async () => {
    if (sync.key) return sendInvite(sync.key);
    setBusy(true);
    onStatus('Setting up sharing…');
    try {
      const key = await startSharing();
      onStatus(undefined);
      await sendInvite(key);
    } catch (err) {
      onStatus(ERRORS[(err as Error).message] ?? ERRORS.failed);
    } finally {
      setBusy(false);
    }
  };

  const join = async (key: string) => {
    setBusy(true);
    onStatus('Joining the household…');
    try {
      await joinHousehold(key);
      setJoining(false);
      setCode('');
      onStatus("You're in. This phone now shares the household.");
    } catch (err) {
      onStatus(ERRORS[(err as Error).message] ?? ERRORS.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings__group" aria-labelledby="sharing-heading">
      <h2 id="sharing-heading" className="settings__heading">
        {sync.key ? 'Shared household' : 'Share this household'}
      </h2>
      {sync.key ? (
        <p className="settings__hint">
          {sync.error ? ERRORS[sync.error] : ago(sync.lastSyncedAt)}. Everyone you invite sees the same plan, check-offs
          and records.
        </p>
      ) : (
        <p className="settings__hint">
          Invite someone who lives with you. You'll both see the same plan, check-offs and records, kept in step on each
          phone.
        </p>
      )}
      <button type="button" className="outline-button outline-button--wide" disabled={busy} onClick={invite}>
        {sync.key ? 'Send invite link' : 'Invite to this household'}
      </button>
      {sync.key && (
        <>
          <p className="settings__hint settings__hint--small">
            Anyone with the invite link can see and change this household. Only send it to people in your home.
          </p>
          <div className="settings__row-buttons">
            <button type="button" className="settings__text-button" disabled={busy} onClick={() => void syncNow()}>
              Sync now
            </button>
            <button type="button" className="settings__text-button" onClick={() => setConfirmLeave(true)}>
              Stop sharing on this phone
            </button>
          </div>
        </>
      )}
      {!sync.key && !joining && (
        <button type="button" className="settings__text-button" onClick={() => setJoining(true)}>
          Join someone else's household
        </button>
      )}
      {!sync.key && joining && (
        <form
          className="settings__join"
          onSubmit={(e) => {
            e.preventDefault();
            const key = parseInvite(code);
            if (key) setConfirmJoin(key);
            else onStatus("That doesn't look like an invite link. Paste the whole link you were sent.");
          }}
        >
          <label className="field">
            <span className="field__label">Invite link</span>
            <input
              className="text-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the link you were sent"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </label>
          <button type="submit" className="outline-button outline-button--wide" disabled={busy || !code.trim()}>
            Join
          </button>
        </form>
      )}

      <ActionSheet
        open={!!confirmJoin}
        title="Join this household?"
        message="Everything on this phone will be replaced with the shared household. Save a backup first if you want to keep it."
        onClose={() => setConfirmJoin(null)}
        actions={[
          {
            label: 'Replace and join',
            tone: 'clay',
            onSelect: () => {
              const k = confirmJoin!;
              setConfirmJoin(null);
              void join(k);
            },
          },
        ]}
      />
      <ActionSheet
        open={confirmLeave}
        title="Stop sharing on this phone?"
        message="This phone keeps its copy of the household but stops syncing. The others keep sharing. You'll need a new invite to rejoin."
        onClose={() => setConfirmLeave(false)}
        actions={[
          {
            label: 'Stop sharing',
            tone: 'clay',
            onSelect: async () => {
              setConfirmLeave(false);
              await leaveHousehold();
              onStatus('This phone no longer shares the household.');
            },
          },
        ]}
      />
    </section>
  );
}

/** Settings: a link to a fresh, empty Neatly, for someone starting their own household. */
export function TellSomeoneSection({ onStatus }: { onStatus: (s: string | undefined) => void }) {
  return (
    <section className="settings__group">
      <h2 className="settings__heading">Share Neatly</h2>
      <p className="settings__hint">
        Send someone their own blank copy of Neatly. Their household is separate and starts empty.
      </p>
      <button
        type="button"
        className="outline-button outline-button--wide"
        onClick={async () => {
          const r = await shareLink(
            'Neatly Household',
            'Try Neatly, a calm way to keep up with the house. Open this link, then Share → Add to Home Screen:',
            APP_URL,
          );
          if (r === 'copied') onStatus('Link copied. Paste it into a message.');
        }}
      >
        Send Neatly to someone
      </button>
    </section>
  );
}
