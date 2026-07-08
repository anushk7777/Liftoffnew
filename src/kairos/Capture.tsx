import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Check, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { pop, springSoft, useReducedMotion } from '../lib/motion';
import { haptics } from '../lib/haptics';
import { useKairos } from './store';
import { MOODS } from './moments';
import { cameraSupported, openCamera, stopStream, frameToDataUrl } from './photo';
import type { MoodId } from './types';

const AMOR_FATI_PROMPTS = [
  'What is this moment asking of you?',
  'Capture it exactly as it is — nothing to fix.',
  'What will you want to remember about right now?',
  'Say the true thing, only for yourself.',
  'What are you grateful for in this instant?',
  'Amor fati — love what is. What is here now?',
];

/** Live-camera capture overlay. Streams the rear camera; a tap freezes a frame
 *  into a downscaled JPEG. Camera only — there is no gallery path, by design. */
function CameraSheet({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const rm = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openCamera()
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not open the camera.'));
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v) return;
    const url = frameToDataUrl(v);
    if (url) {
      haptics.success();
      onCapture(url);
    }
  };

  return (
    <motion.div
      initial={rm ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={rm ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center" aria-label="Close camera">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white/70 text-sm">Capture this moment</span>
        <span className="w-10" />
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-white/80 text-center px-8 text-sm">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-center p-6">
          <motion.button
            whileTap={rm ? undefined : { scale: 0.9 }}
            transition={pop}
            onClick={shoot}
            aria-label="Take photo"
            className="w-18 h-18 rounded-full bg-white ring-4 ring-white/30"
            style={{ width: 72, height: 72 }}
          />
        </div>
      )}
    </motion.div>
  );
}

export default function Capture({ onSaved }: { onSaved?: () => void }) {
  const rm = useReducedMotion();
  const addMoment = useKairos((s) => s.addMoment);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<MoodId | undefined>();
  const [photo, setPhoto] = useState<string | undefined>();
  const [place, setPlace] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [prompt] = useState(() => AMOR_FATI_PROMPTS[Math.floor(new Date().getSeconds() / 10) % AMOR_FATI_PROMPTS.length]);

  const canSave = text.trim().length > 0 || !!photo;

  const save = () => {
    if (!canSave) return;
    addMoment({ text, mood, photo, place });
    haptics.success();
    setText('');
    setMood(undefined);
    setPhoto(undefined);
    setPlace('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
    onSaved?.();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl text-ink">This moment</h2>
        <p className="text-sm text-ink-muted mt-0.5">{prompt}</p>
      </div>

      <div className="card p-4" style={{ background: 'var(--card-grad)' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write what's happening, and how it feels…"
          rows={5}
          className="w-full bg-transparent resize-none outline-none font-display text-lg leading-relaxed text-ink placeholder:text-ink-subtle"
        />

        {photo && (
          <div className="relative mt-2 rounded-xl overflow-hidden border border-border">
            <img src={photo} alt="" className="w-full max-h-72 object-cover" />
            <button
              onClick={() => setPhoto(undefined)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mood picker */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {MOODS.map((m) => (
            <motion.button
              key={m.id}
              whileTap={rm ? undefined : { scale: 0.92 }}
              transition={pop}
              onClick={() => setMood((cur) => (cur === m.id ? undefined : m.id))}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors',
                mood === m.id ? 'text-ink' : 'text-ink-muted border-border hover:border-border-strong',
              )}
              style={mood === m.id ? { borderColor: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)` } : undefined}
            >
              <span aria-hidden>{m.emoji}</span>
              {m.label}
            </motion.button>
          ))}
        </div>

        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where are you? (optional)"
          className="input mt-3 !py-2 text-sm"
        />

        <div className="mt-4 flex items-center gap-2">
          {cameraSupported() && (
            <motion.button
              whileTap={rm ? undefined : { scale: 0.95 }}
              transition={pop}
              onClick={() => setCameraOpen(true)}
              className="btn btn-secondary !py-2 !px-3 text-sm"
            >
              {photo ? <RotateCcw className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              {photo ? 'Retake' : 'Photo'}
            </motion.button>
          )}
          <motion.button
            whileTap={rm ? undefined : { scale: 0.96 }}
            transition={pop}
            disabled={!canSave}
            onClick={save}
            className="btn btn-primary ml-auto !py-2 !px-5 text-sm disabled:opacity-40"
          >
            <Check className="w-4 h-4" /> Keep this moment
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {justSaved && (
          <motion.p
            initial={rm ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={rm ? undefined : { opacity: 0 }}
            transition={springSoft}
            className="text-center text-sm mt-4"
            style={{ color: 'var(--kairos)' }}
          >
            Sealed. This exact moment is yours forever.
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cameraOpen && (
          <CameraSheet
            onCapture={(url) => {
              setPhoto(url);
              setCameraOpen(false);
            }}
            onClose={() => setCameraOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
