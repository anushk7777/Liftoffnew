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
import { deleteMomentPhoto, uploadMomentPhoto } from './photo';
import type { Moment, MoodId } from './types';

/** Moments whose photo is still stored inline as base64 (captured before the
 *  Storage bucket existed) — the candidates for the one-time migration. */
export function inlinePhotoMoments(moments: Moment[]): Moment[] {
  return moments.filter((m) => !!m.photo && m.photo.startsWith('data:'));
}

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
  /** Which account this device's diary belongs to. See loadMoments. */
  ownerId: string | null;
  _cloudLoaded: boolean;
  loadMoments: () => Promise<void>;
  /** Wipe this device's diary — used when the signed-in account changes. */
  resetDiary: () => void;
  /** Capture a moment. The timestamp is locked here, at the instant of capture. */
  addMoment: (m: NewMoment) => Moment;
  /** Refine an existing moment's words/mood/song/place. createdAt stays locked. */
  updateMoment: (id: string, patch: MomentEdit) => void;
  /** Delete a moment (the one destructive action — capture-time is otherwise immutable). */
  deleteMoment: (id: string) => void;
  /** One-time: upload any inline (base64) photos to Storage + swap to a path. */
  migrateInlinePhotos: () => Promise<void>;
}

// Runs at most once per session (across every entry point that loads moments).
let migrationStarted = false;

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
      ownerId: null,
      _cloudLoaded: false,

      resetDiary: () => {
        setMarker(EPOCH);
        set({ moments: [], ownerId: null });
      },

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
          // A different account on this browser: the local diary belongs to the
          // previous one. Clearing it first is essential — the branch below
          // UPLOADS local moments the cloud doesn't have, which would write one
          // person's private diary into another's account.
          const id = session.user.id;
          const prevOwner = get().ownerId;
          if (prevOwner && prevOwner !== id) get().resetDiary();
          set({ ownerId: id });

          const { data, error } = await supabase
            .from('journal_data')
            .select('data, updated_at')
            .eq('id', id)
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
        // Fire-and-forget one-time migration of any legacy inline photos.
        void get().migrateInlinePhotos();
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

      deleteMoment: (id) => {
        const gone = get().moments.find((x) => x.id === id);
        if (gone?.photo) void deleteMomentPhoto(gone.photo); // best-effort storage cleanup
        set((s) => ({ moments: s.moments.filter((x) => x.id !== id) }));
      },

      // Move photos captured before the Storage bucket existed (inline base64)
      // into the bucket, one at a time, swapping each moment's photo to a path.
      // Best-effort: an upload that can't run (offline / bucket missing) leaves
      // the base64 in place, so nothing is lost and it retries next session.
      migrateInlinePhotos: async () => {
        if (!isSupabaseConfigured || migrationStarted) return;
        migrationStarted = true;
        const pending = inlinePhotoMoments(get().moments);
        for (const m of pending) {
          const path = await uploadMomentPhoto(m.id, m.photo!);
          if (path && get().moments.some((x) => x.id === m.id)) {
            get().updateMoment(m.id, { photo: path });
          }
        }
      },
    }),
    {
      name: 'liftoff-kairos',
      version: 1,
      // ownerId is persisted so an account switch is detectable across reloads;
      // it is never part of the cloud payload (which sends only `moments`).
      partialize: (s) => ({ moments: s.moments, ownerId: s.ownerId }),
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
