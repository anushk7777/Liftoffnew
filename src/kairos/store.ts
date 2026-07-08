// Kairos store. Local-first (zustand persist to localStorage) with optional
// cloud sync to a dedicated `journal_data` table in the SAME Supabase backend
// the rest of Liftoff uses — the same machinery that powers task reminders. The
// cloud copy is what the annual-resurfacing Edge Function reads to email/push a
// moment back on its anniversary.
//
// Privacy note: moments are your private diary. They're isolated per-user by
// Supabase RLS (auth.uid() = id), exactly like your tasks and workouts. They are
// NOT end-to-end encrypted, because the server has to read a moment's text to
// email it back to you on its anniversary — that's the core feature. Nothing is
// public or shared.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Moment, MoodId } from './types';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Recency marker so a freshly-opened device never overwrites newer cloud data.
const SYNCED_AT = 'liftoff_kairos_synced_at';
const EPOCH = '1970-01-01T00:00:00.000Z';
const getMarker = (): string => {
  try {
    return localStorage.getItem(SYNCED_AT) || EPOCH;
  } catch {
    return EPOCH;
  }
};
const setMarker = (ts: string): void => {
  try {
    localStorage.setItem(SYNCED_AT, ts);
  } catch {
    /* storage unavailable */
  }
};

export interface NewMoment {
  text: string;
  mood?: MoodId;
  photo?: string;
  place?: string;
  song?: string;
  songUrl?: string;
}

interface KairosState {
  moments: Moment[];
  _cloudLoaded: boolean;
  loadMoments: () => Promise<void>;
  /** Capture a moment. The timestamp is locked here, at the instant of capture. */
  addMoment: (m: NewMoment) => Moment;
  /** Delete a moment (the one destructive action — capture-time is otherwise immutable). */
  deleteMoment: (id: string) => void;
}

export const useKairos = create<KairosState>()(
  persist(
    (set) => ({
      moments: [],
      _cloudLoaded: false,

      loadMoments: async () => {
        if (!isSupabaseConfigured) {
          set({ _cloudLoaded: true });
          return;
        }
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            set({ _cloudLoaded: true });
            return;
          }
          const { data, error } = await supabase
            .from('journal_data')
            .select('data, updated_at')
            .eq('id', session.user.id)
            .single();
          if (error && error.code !== 'PGRST116') console.error('Kairos cloud load failed', error);
          const cloudTs = data?.updated_at ?? '';
          if (data?.data && cloudTs > getMarker()) {
            const d = data.data as { moments?: Moment[] };
            if (Array.isArray(d.moments)) set({ moments: d.moments });
            setMarker(cloudTs || new Date().toISOString());
          }
        } catch (e) {
          console.error('Kairos cloud load failed', e);
        }
        set({ _cloudLoaded: true });
      },

      addMoment: (m) => {
        const moment: Moment = {
          id: uid(),
          createdAt: new Date().toISOString(),
          text: m.text.trim(),
          mood: m.mood,
          photo: m.photo,
          place: m.place?.trim() || undefined,
          song: m.song?.trim() || undefined,
          songUrl: m.songUrl?.trim() || undefined,
        };
        set((s) => ({ moments: [moment, ...s.moments] }));
        return moment;
      },

      deleteMoment: (id) => set((s) => ({ moments: s.moments.filter((x) => x.id !== id) })),
    }),
    {
      name: 'liftoff-kairos',
      version: 1,
      partialize: (s) => ({ moments: s.moments }),
    },
  ),
);

// Push moment changes to the cloud (debounced). Gated on _cloudLoaded so we
// never overwrite the cloud before the first pull.
let lastMoments = useKairos.getState().moments;
let syncTimer: ReturnType<typeof setTimeout>;
useKairos.subscribe((state) => {
  if (!isSupabaseConfigured || !state._cloudLoaded) return;
  if (state.moments === lastMoments) return;
  lastMoments = state.moments;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const ts = new Date().toISOString();
      const { error } = await supabase.from('journal_data').upsert(
        { id: session.user.id, data: { moments: state.moments }, updated_at: ts },
        { onConflict: 'id' },
      );
      if (error) {
        console.error('Kairos cloud sync failed', error);
        return;
      }
      setMarker(ts);
    } catch (e) {
      console.error('Kairos cloud sync failed', e);
    }
  }, 1000);
});
