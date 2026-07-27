# Kairos: diary logic, and where to attack it

How the diary stores, syncs, resurfaces and searches moments.

Written to be **argued with**, like `TRAINING_LOGIC.md`. Reasons are stated for
the non-obvious decisions, and the last section lists what is known to be weak.
If you are reviewing this, start there.

| Concern | File |
| --- | --- |
| Pure helpers: resurfacing, grouping, search | `src/kairos/moments.ts` |
| Store, cloud sync, photo migration | `src/kairos/store.ts` |
| Photo capture, downscale, upload | `src/kairos/photo.ts` |

---

## 1. What a moment is

Captured with the timestamp **locked at the instant of capture** and never
editable — the words, mood, place and song can be refined later, but when it
happened cannot. Photos are camera-only, never a gallery pick, so a moment is
genuinely *this* moment.

## 2. Storage and privacy

Local-first in `localStorage`, with optional sync to `journal_data` in Supabase,
isolated per account by RLS (`auth.uid() = id`).

Moments are **not** end-to-end encrypted, and that is a deliberate trade: the
resurfacing Edge Function has to read a moment's text to email it back on its
anniversary. Nothing is shared or public.

The diary is scoped to the account that owns it (`ownerId`). Signing a different
account into the same browser resets the local copy rather than merging it —
without that, the loader's "seed the cloud from local" branch would write one
person's private diary into another's account.

## 3. Photos

Captured at 1024px longest edge as a JPEG data URL, then uploaded to the
`journal-photos` bucket and replaced by a storage path.

**The bug this fixed.** Migration was a one-shot flag set at app load, so:

- a photo captured *after* load stayed inline for the rest of the session
- a failed upload was never retried
- meanwhile every debounced save pushes the **whole moments array** to
  `journal_data`, so each inline photo — a few hundred KB as base64 — was
  re-uploaded in full on every subsequent change

Now the guard only prevents two migrations running at once, and capture triggers
the migration immediately, so a photo becomes a path within moments rather than
lingering as base64 in every sync.

## 4. Resurfacing

`onThisDay` matches the same calendar month and day in an *earlier* year, so a
moment from this year never resurfaces. Leap-day moments (Feb 29) fold onto
Feb 28 in non-leap years, so they still come back annually.

Compared as **civil dates**, not 24-hour multiples, so timezones and DST cannot
shift a moment onto the wrong day.

## 5. Search

`searchMoments`. Added because a diary you cannot search stops being useful at
exactly the point it becomes valuable — a few hundred entries in, when scrolling
a timeline finds nothing.

- **Every term must match (AND)**, since narrowing is the point.
- **A term may match any field** — text, place, song, or the mood's label — so
  the user need not remember which one it was.
- **Case and accents are ignored**, so `CAFE` finds `café`. Done by NFD
  normalising and stripping the combining-diacritics block.
- The mood **filter** and the query compose; either alone works.

---

## 6. Known weaknesses — start here

1. **Sync rewrites the whole diary on every change.** `pushMomentsToCloud`
   upserts the entire moments array, so editing one word re-uploads everything.
   Fine at a few hundred moments, wasteful well before a few thousand.
2. **Last write wins across devices.** The recency marker compares the cloud's
   `updated_at` against a local timestamp; two devices editing while offline
   will lose one side's changes. There is no per-moment merge.
3. **Search is a substring scan over every moment on every keystroke.** No index
   and no debounce. Imperceptible at hundreds, will need work at tens of
   thousands.
4. **Search has no stemming or fuzziness** — "running" does not find "ran", and
   a typo finds nothing.
5. **A deleted moment's photo may outlive it.** Deletion removes the row; the
   storage object is removed separately, and a failure there leaves an orphan
   with nothing pointing at it.
6. **`migrateInlinePhotos` walks the whole list** each time it runs. Cheap while
   inline photos are rare (they should now be), but it is a linear scan on
   every capture.
7. **Photos are not in the search index.** There is nothing to match on — no
   caption field distinct from the moment text, and no image analysis.

## Testing

`src/kairos/{moments,store,search}.test.ts`.

```bash
npm test
```
