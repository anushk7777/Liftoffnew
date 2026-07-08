// Kairos photo helpers. Photos are captured from the live camera only (never a
// gallery pick) and downscaled before storage. A captured photo starts life as
// a data URL (instant, offline-safe) and is then uploaded to a private Supabase
// Storage bucket, with the moment's `photo` swapped to the storage path — so the
// heavy image lives in object storage, not inside the synced JSON row.
import { supabase } from '../lib/supabase';

/** The private bucket that holds moment photos (one folder per user). */
export const PHOTO_BUCKET = 'journal-photos';

/** Longest-edge cap and JPEG quality for stored moment photos. */
const MAX_EDGE = 1024;
const QUALITY = 0.72;

/** A stored `photo` is either an inline data URL / remote URL (render directly)
 *  or a Storage object path like "userId/momentId.jpg" (needs a signed URL). */
export function isStoragePath(photo: string | undefined): boolean {
  return !!photo && !photo.startsWith('data:') && !photo.startsWith('http');
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Upload a captured photo (data URL) to the user's folder in Storage. Returns
 *  the object path to store on the moment, or null if it couldn't upload (offline
 *  / not signed in) — in which case the caller keeps the inline data URL. */
export async function uploadMomentPhoto(momentId: string, dataUrl: string): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const path = `${session.user.id}/${momentId}.jpg`;
    const blob = await dataUrlToBlob(dataUrl);
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.error('Kairos photo upload failed', error);
      return null;
    }
    return path;
  } catch (e) {
    console.error('Kairos photo upload failed', e);
    return null;
  }
}

/** A signed, time-limited URL to display a stored photo path. */
export async function signedPhotoUrl(path: string, expiresInSec = 60 * 60 * 24 * 7): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, expiresInSec);
    if (error) {
      console.error('Kairos signed URL failed', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error('Kairos signed URL failed', e);
    return null;
  }
}

/** Best-effort removal of a moment's stored photo object (on delete). */
export async function deleteMomentPhoto(photo: string | undefined): Promise<void> {
  if (!isStoragePath(photo)) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([photo!]);
  } catch (e) {
    console.error('Kairos photo delete failed', e);
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Draw a video/image frame onto a canvas, downscaled to MAX_EDGE, and return a
 *  JPEG data URL. Used to turn a live camera frame into a stored photo. */
export function frameToDataUrl(source: HTMLVideoElement | HTMLImageElement): string {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) return '';
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Open the rear camera as a MediaStream. Caller is responsible for stopping it
 *  (stopStream) when done. Rejects if permission is denied or unsupported. */
export async function openCamera(): Promise<MediaStream> {
  if (!cameraSupported()) throw new Error('Camera not supported on this device.');
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
    audio: false,
  });
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
