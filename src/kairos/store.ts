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

/** Fields of a captured moment that can be refined later. The capture *time*
 *  (createdAt) and photo identity stay as they were — amor fati. */
export type MomentEdit = Partial<Pick<Moment, 'text' | 'mood' | 'photo' | 'place' | 'song' | 'songUrl'>>;

interface KairosState {
  moments: Moment[];
  _cloudLoaded: boolean;
  loadMoments: () => Promise<void>;
  /** Capture a moment. The timestamp is locked here, at the instant of capture. */
  addMoment: (m: NewMoment) => Moment;
  /** Refine an existing moment's words/mood/song/place. createdAt stays locked. */
  updateMoment: (id: string, patch: MomentEdit) => void;
  /** Delete a moment (the one destructive action — capture-time is otherwise immutable). */
  deleteMoment: (id: string) => void;
}

// Upsert the whole moments list to the user's cloud row. Shared by the debounced
// subscribe and the after-load "seed the cloud" flush.
async function pushMomentsToCloud(moments: Moment[]): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const ts = new Date().toISOString();
    const { error } = await supabase.from('journal_data').upsert(
      { id: session.user.id, data: { moments }, updated_at: ts },
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
}

export const useKairos = create<KairosState>()(
  persist(
    (set, get) => ({
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
          const cloudMoments = (data?.data as { moments?: Moment[] } | undefined)?.moments;
          if (Array.isArray(cloudMoments) && cloudTs > getMarker()) {
            // Cloud is newer — adopt it.
            set({ moments: cloudMoments });
            setMarker(cloudTs || new Date().toISOString());
          } else if (get().moments.length > 0 && (!Array.isArray(cloudMoments) || cloudMoments.length < get().moments.length)) {
            // Local has moments the cloud doesn't (e.g. captured before the table
            // existed, or a device that's ahead). Seed/refresh the cloud now so
            // nothing lives only on this device.
            await pushMomentsToCloud(get().moments);
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

      updateMoment: (id, patch) =>
        set((s) => ({
          moments: s.moments.map((mo) =>
            mo.id !== id
              ? mo
              : {
                  ...mo,
                  ...patch,
                  // Normalize the optional string fields (trim → undefined when blank).
                  text: patch.text !== undefined ? patch.text.trim() : mo.text,
                  place: patch.place !== undefined ? patch.place.trim() || undefined : mo.place,
                  song: patch.song !== undefined ? patch.song.trim() || undefined : mo.song,
                  songUrl: patch.songUrl !== undefined ? patch.songUrl.trim() || undefined : mo.songUrl,
                },
          ),
        })),

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
  syncTimer = setTimeout(() => pushMomentsToCloud(state.moments), 1000);
});
