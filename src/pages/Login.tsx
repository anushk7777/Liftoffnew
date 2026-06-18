import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function Login() {
  const navigate = useNavigate();
  const { loadFromDB } = useStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Trigger load from DB to hydrate zustand store with user's data
        loadFromDB();
        navigate('/');
      }
    });

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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      alert('Error logging in: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background p-8 animate-rise">
      <div className="w-full max-w-sm card p-8 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
          <Sparkles className="w-8 h-8 text-on-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
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

        <p className="text-xs text-ink-muted pt-4 border-t border-border/50 w-full">
          By signing in, your local roadmap data will automatically migrate to your new account.
        </p>
      </div>
    </div>
  );
}
