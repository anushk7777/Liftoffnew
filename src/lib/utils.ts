import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Guarded localStorage write. Some environments (Safari private mode, storage
// disabled, quota exceeded) throw on setItem; we never want that to crash a
// render or an event handler. Returns true on success, false if it was dropped.
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
