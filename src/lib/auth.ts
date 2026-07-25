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
