// The lines Afterburn throws at you when a workout ignites — one at random per
// launch (picked in the event handler so the overlay stays a pure component).
export const IGNITION_PHRASES = [
  'Burning now.',
  'Ignition.',
  'All gas, no brakes.',
  'Time under tension.',
  'Earn the plates.',
  'Light the fuse.',
  'Chalk up. Lock in.',
  'One more than yesterday.',
  'Meet gravity. Beat it.',
  'Heavy is the way.',
  'No free reps.',
  'Show up. Go up.',
];

export const randomIgnitionPhrase = (): string =>
  IGNITION_PHRASES[Math.floor(Math.random() * IGNITION_PHRASES.length)];
