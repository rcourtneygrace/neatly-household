import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { joinHousehold, parseInvite, useSyncState } from '../../data/sync';
import { goBack } from '../../ui/goBack';
import '../records/records.css';
import '../records/record-form.css';
import './settings.css';

const ERRORS: Record<string, string> = {
  offline: "You're offline. Connect to the internet and try again.",
  'not allowed': "This invite doesn't work anymore. Ask for a new one.",
  empty: "This invite didn't lead to a household. Ask for a new one.",
};

function inHomeScreenApp(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Opened from an invite link. On iPhone, Safari and the Home Screen app keep separate data,
 * so in Safari we explain how to join from the Home Screen app instead.
 */
export function JoinScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const key = parseInvite(params.key ?? '');
  const sync = useSyncState();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inBrowser, setInBrowser] = useState(false);
  const app = inHomeScreenApp();

  const join = async () => {
    if (!key) return;
    setBusy(true);
    setStatus('Joining the household…');
    try {
      await joinHousehold(key);
      navigate('/today', { replace: true });
    } catch (err) {
      setStatus(ERRORS[(err as Error).message] ?? "Couldn't join just now. Please try again.");
      setBusy(false);
    }
  };

  const alreadyIn = sync?.key === key;

  return (
    <main className="settings">
      <header className="detail-header">
        <button type="button" className="back-button" onClick={() => goBack(navigate, '/today')}>
          <Icon name="chevron-left" size={22} label="Back" />
        </button>
        <div className="detail-header__titles">
          <h1 className="detail-header__title">Join a household</h1>
        </div>
      </header>

      {!key ? (
        <p className="settings__hint">This invite link is incomplete. Ask for the link again.</p>
      ) : alreadyIn ? (
        <section className="settings__group">
          <p className="settings__hint">This phone is already part of this household.</p>
          <button type="button" className="outline-button outline-button--wide" onClick={() => navigate('/today', { replace: true })}>
            Go to Today
          </button>
        </section>
      ) : !app && !inBrowser ? (
        <section className="settings__group">
          <p className="settings__text">You've been invited to share a household on Neatly.</p>
          <ol className="settings__steps">
            <li>
              Tap <strong>Copy invite</strong> below.
            </li>
            <li>
              Tap the Share button in Safari, then <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Open Neatly from your Home Screen, go to <strong>Settings</strong>, tap{' '}
              <strong>Join someone else's household</strong> and paste the invite.
            </li>
          </ol>
          <p className="settings__hint">
            Already have Neatly on your Home Screen? Copy the invite and paste it there in Settings.
          </p>
          <button
            type="button"
            className="outline-button outline-button--wide"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
            }}
          >
            {copied ? 'Invite copied' : 'Copy invite'}
          </button>
          <button type="button" className="settings__text-button" onClick={() => setInBrowser(true)}>
            Use Neatly in this browser instead
          </button>
        </section>
      ) : (
        <section className="settings__group">
          <p className="settings__text">You've been invited to share a household on Neatly.</p>
          <p className="settings__hint">
            Anything already in Neatly on this phone will be replaced with the shared household.
          </p>
          <button type="button" className="outline-button outline-button--wide" disabled={busy} onClick={join}>
            Join household
          </button>
        </section>
      )}

      {status && (
        <p className="settings__status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}
