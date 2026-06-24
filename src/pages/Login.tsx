import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function Login() {
  const navigate = useNavigate();
  const { loadFromDB } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) {
          // Trigger load from DB to hydrate zustand store with user's data
          loadFromDB();
          navigate('/');
        }
      })
      .catch((err) => console.error('Failed to check existing session:', err));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadFromDB();
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, loadFromDB]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setError("Couldn't sign in with Google. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background p-8 animate-rise">
      <div className="w-full max-w-sm card p-8 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg">
          <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="var(--accent-text)" />
          </svg>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-4xl text-[var(--text)] leading-none" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Liftoff
          </h1>
          <p className="text-sm text-ink-subtle">
            Sign in to sync your flight plan across all devices.
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="btn btn-primary w-full py-3 mt-4 text-base shadow-md disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Sign in with Google'}
        </button>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="text-xs text-ink-muted pt-4 border-t border-border/50 w-full">
          By signing in, your local roadmap data will automatically migrate to your new account.
        </p>
      </div>
    </div>
  );
}
