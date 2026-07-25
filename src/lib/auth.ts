// Session actions shared by the account controls.
import { supabase } from './supabase';
import { useAppMode } from '../afterburn/mode';
import { useStore } from '../store/useStore';

/** Persisted workspaces that are scoped to an account, by localStorage key. */
const WORKSPACE_KEYS = [
  'liftoff-afterburn', // training log
  'liftoff-kairos', // diary
  'liftoff_kairos_synced_at',
  'liftoff_afterburn_synced_at',
];

/**
 * Sign out and leave this browser clean.
 *
 * Clearing the local workspaces is the point, not politeness: each one keeps an
 * offline copy in localStorage that is not scoped to an account. Left behind,
 * the next person to sign in on this browser would see it — and push it to
 * their own cloud row on the next save.
 *
 * Afterburn and Kairos are cleared by key rather than through their stores, so
 * this stays out of the eager bundle (see the note in afterburn/mode.ts). The
 * real guarantee is the ownerId check each store runs when it loads, which
 * holds however the account changed — expired token, fresh tab, or this button.
 */
export async function signOutOfLiftoff(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Sign out failed', e);
  }
  useStore.getState().resetWorkspace();
  for (const key of WORKSPACE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — the per-store ownerId guard still covers us */
    }
  }
  useAppMode.getState().setMode(null);
}

/** Wipe every local workspace without touching the session. */
export function clearLocalWorkspaces(): void {
  useStore.getState().resetWorkspace();
  for (const key of WORKSPACE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}

/**
 * Permanently delete the signed-in account and everything attached to it.
 *
 * The deletion runs in the `delete-account` Edge Function, which needs the
 * service-role key. It acts only on the identity inside the caller's own token
 * — there is no user id parameter to point it elsewhere.
 */
export async function deleteAccountForever(): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'You are not signed in.' };

  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }

  let body: { ok?: boolean; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON response — fall through to the status check */
  }
  if (!res.ok || !body.ok) {
    if (res.status === 404) {
      return { ok: false, error: 'The delete-account function is not deployed yet. See docs/ACCOUNT_DELETION.md.' };
    }
    return { ok: false, error: body.error || `Delete failed (${res.status}).` };
  }

  // The account is gone; clear this device so nothing can be re-uploaded.
  clearLocalWorkspaces();
  try {
    await supabase.auth.signOut();
  } catch {
    /* the account no longer exists — the local session is already void */
  }
  useAppMode.getState().setMode(null);
  return { ok: true };
}
