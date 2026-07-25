// Session actions shared by the account controls.
import { supabase } from './supabase';
import { useAppMode } from '../afterburn/mode';
import { useStore } from '../store/useStore';

/**
 * Sign out and leave this browser clean.
 *
 * Clearing the local workspace is the point, not politeness: Liftoff keeps an
 * offline copy in localStorage, and that copy is not scoped to an account. Left
 * behind, the next person to sign in on this browser would see it merged into
 * their workspace — and push it to their cloud row on the next save.
 */
export async function signOutOfLiftoff(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Sign out failed', e);
  }
  useStore.getState().resetWorkspace();
  useAppMode.getState().setMode(null);
}
