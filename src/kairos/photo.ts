// Kairos photo helpers. Photos are captured from the live camera only (never a
// gallery pick) and downscaled before storage so a moment stays lightweight
// enough to persist locally and sync as JSON.

/** Longest-edge cap and JPEG quality for stored moment photos. */
const MAX_EDGE = 1024;
const QUALITY = 0.72;

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
