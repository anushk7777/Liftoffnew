// Permanent account deletion. Irreversible, so it asks for the account's own
// email to be typed out — a checkbox or a plain "Are you sure?" is too easy to
// click through for something with no undo.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { deleteAccountForever } from '../lib/auth';
import { useSessionEmail } from '../coaching/api';

export default function DangerZone() {
  const { email, loading } = useSessionEmail();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (loading || !email) return null;

  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccountForever();
    setBusy(false);
    if (res.ok) navigate('/login');
    else setError(res.error);
  };

  return (
    <div className="py-2">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-subtle max-w-md">
            Permanently delete <span className="text-ink">{email}</span> and everything in it — tasks,
            roadmap, training log and diary, on every device. This cannot be undone.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="btn !py-1.5 !px-3 text-xs font-semibold shrink-0"
            style={{ background: 'var(--danger-soft, rgba(239,68,68,.12))', color: 'var(--danger, #ef4444)' }}
          >
            Delete account
          </button>
        </div>
      ) : (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--danger, #ef4444)', background: 'var(--danger-soft, rgba(239,68,68,.06))' }}
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-ink">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--danger, #ef4444)' }} />
            This deletes everything, permanently.
          </p>
          <p className="text-xs text-ink-subtle mt-2">
            Your tasks, roadmap, habits, focus history, training log, diary and photos are removed from
            the cloud and from this device. There is no undo and no export afterwards. If you only want
            to switch accounts, sign out instead.
          </p>
          <label className="block text-xs text-ink-subtle mt-3">
            Type <span className="text-ink font-medium">{email}</span> to confirm:
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={email}
            className="input w-full mt-1.5 text-sm"
            aria-label="Type your email address to confirm deletion"
          />
          {error && (
            <p className="text-xs mt-2" style={{ color: 'var(--danger, #ef4444)' }}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={run}
              disabled={!confirmed || busy}
              className="btn !py-1.5 !px-3 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--danger, #ef4444)', color: '#fff' }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
              disabled={busy}
              className="btn btn-secondary !py-1.5 !px-3 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
