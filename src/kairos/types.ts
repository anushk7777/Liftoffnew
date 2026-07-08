// Kairos — a private diary of *moments*. The name (καιρός) is the ancient-Greek
// word for the fleeting, opportune instant — the opposite of chronos (clock
// time). A moment captures the exact instant: what you felt, wrote, and — if you
// choose — a real-time photo. The timestamp is LOCKED at capture and never
// edited: amor fati, love of what was.

/** The seven moods a moment can carry. Ids are stable (persisted/synced). */
export type MoodId =
  | 'radiant'
  | 'content'
  | 'calm'
  | 'tender'
  | 'grateful'
  | 'restless'
  | 'heavy';

/** One captured moment. `createdAt` is immutable — set once, at capture. */
export interface Moment {
  id: string;
  /** ISO timestamp, locked at the instant of capture. Never editable. */
  createdAt: string;
  /** The written moment. May be empty when a photo alone is the record. */
  text: string;
  /** Optional mood tag. */
  mood?: MoodId;
  /** Optional real-time photo, stored as a downscaled data URL (JPEG). Camera
   *  only — never a gallery pick — so it's genuinely "this moment". */
  photo?: string;
  /** Optional place label the user typed (kept lightweight; no geolocation). */
  place?: string;
  /** Optional "the song of this moment" — free text (e.g. "Artist — Title"). */
  song?: string;
  /** Optional link to the song (YouTube Music / YouTube / Spotify). If absent
   *  but `song` is set, the UI links to a YouTube Music search for the name. */
  songUrl?: string;
}
