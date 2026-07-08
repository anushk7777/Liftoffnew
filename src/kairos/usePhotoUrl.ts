import { useEffect, useState } from 'react';
import { isStoragePath, signedPhotoUrl } from './photo';

// Cache resolved signed URLs per storage path for the session so re-renders and
// multiple cards don't re-sign the same object.
const cache = new Map<string, string>();

/** Resolve a moment's `photo` to something an <img> can render:
 *  - inline data URL / remote URL → returned as-is,
 *  - a Storage object path → a signed URL (cached).
 *  Returns undefined while a signed URL is still resolving, or on failure. */
export function usePhotoUrl(photo: string | undefined): string | undefined {
  // Derived synchronously — no state needed for direct URLs or cache hits.
  const immediate = !photo ? undefined : !isStoragePath(photo) ? photo : cache.get(photo);
  // Only used for the async signed-URL case; tagged with its path so a card
  // never shows another moment's photo while the new one resolves.
  const [resolved, setResolved] = useState<{ path: string; url: string } | undefined>(undefined);

  useEffect(() => {
    if (!photo || !isStoragePath(photo) || cache.get(photo)) return;
    let alive = true;
    signedPhotoUrl(photo).then((signed) => {
      if (!alive || !signed) return;
      cache.set(photo, signed);
      setResolved({ path: photo, url: signed });
    });
    return () => {
      alive = false;
    };
  }, [photo]);

  return immediate ?? (resolved && resolved.path === photo ? resolved.url : undefined);
}
