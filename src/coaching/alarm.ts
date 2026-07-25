// Weigh-in alarm — deliberately loud.
//
// The app's existing beep() is a soft 0.25-gain chime meant to be pleasant.
// An alarm has the opposite job: it has to wake someone in another room, so
// this uses a much higher gain, a two-tone siren sweep (which the ear tracks
// far better than a steady tone), and a repeating pattern until dismissed.

let ctx: AudioContext | null = null;
let stopAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function audio(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Browsers block audio until the page has had a user gesture. Call this from
 * any click so the alarm can actually sound later without one.
 */
export function primeAlarmAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}

/** One siren burst: a rising then falling tone through a hard limiter. */
function burst(c: AudioContext, at: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  // A compressor lets the tone sit near full scale without clipping harshly,
  // which is what makes it read as "loud" rather than "distorted".
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.ratio.value = 12;

  osc.connect(gain);
  gain.connect(comp);
  comp.connect(c.destination);

  osc.type = 'square'; // richer in harmonics than sine — carries much further
  osc.frequency.setValueAtTime(660, at);
  osc.frequency.linearRampToValueAtTime(1180, at + 0.18);
  osc.frequency.linearRampToValueAtTime(660, at + 0.36);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.9, at + 0.015); // ~3.5× the chime
  gain.gain.setValueAtTime(0.9, at + 0.32);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);

  osc.start(at);
  osc.stop(at + 0.42);
}

/**
 * Start the alarm. Repeats until stopAlarm() or `maxSeconds` elapses, and
 * vibrates in the same rhythm on phones that support it.
 */
export function startAlarm(maxSeconds = 30): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();

  stopAt = Date.now() + maxSeconds * 1000;

  const cycle = () => {
    if (Date.now() >= stopAt) return stopAlarm();
    const now = c.currentTime;
    // Three bursts per cycle — the classic alarm cadence.
    burst(c, now);
    burst(c, now + 0.5);
    burst(c, now + 1.0);
    try {
      navigator.vibrate?.([400, 120, 400, 120, 400]);
    } catch {
      /* vibration is best-effort */
    }
    timer = setTimeout(cycle, 1800);
  };
  cycle();
}

export function stopAlarm(): void {
  stopAt = 0;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

/** Preview the sound once, for the settings row. */
export function testAlarm(): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  burst(c, c.currentTime);
  burst(c, c.currentTime + 0.5);
}

// ---- Scheduling ----------------------------------------------------------
const FIRED_KEY = 'liftoff_coaching_alarm_fired';

/** "HH:MM" → minutes since midnight, or null when unparseable. */
export function parseTime(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when the alarm time has arrived today and it hasn't already fired.
 * A 5-minute window means a tab opened slightly late still rings, while
 * localStorage keeps it to once a day.
 */
export function alarmDue(time: string | null | undefined, now = new Date()): boolean {
  const target = parseTime(time);
  if (target == null) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < target || mins > target + 5) return false;
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  try {
    if (localStorage.getItem(FIRED_KEY) === today) return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function markAlarmFired(now = new Date()): void {
  try {
    localStorage.setItem(FIRED_KEY, `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
  } catch {
    /* ignore */
  }
}
