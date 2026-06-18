# Liftoff — Project Status (plain-English)

_Last updated: 2026-06-18. Branch: `claude/app-code-review-gw1ixi`._

This document explains, in everyday language, what Liftoff is now, what changed
recently, what state it's in, and the few things that still need you.

---

## What Liftoff is
A personal "6-month developer roadmap" tracker — tasks, a daily schedule,
habits, a focus timer, a roadmap, stats, and an AI-style coach. Your data lives
on your device first and optionally syncs to the cloud (Supabase) when you sign
in with Google.

## What was built recently (this round of work)

### 1. A real mobile app experience
Liftoff used to be a desktop website that just shrank awkwardly on a phone.
Now there is a **dedicated mobile version** that automatically appears on
phones, while desktop keeps its full layout. The old "make-do" mobile bits were
removed entirely, so there's exactly one mobile experience — no leftovers, no
confusion.

On a phone you get:
- A clean **bottom tab bar**: Today, Tasks, Focus, Schedule, and a **More**
  menu (Roadmap, Coach, Habits, Brain Dump, Stats, Settings, light/dark).
- A **Today** screen with your greeting, daily progress, a coach tip, today's
  tasks, a focus shortcut, and your streak.
- **Swipe gestures** on tasks — swipe right to complete, left to delete.
- **Pull-to-refresh** — drag down to sync with the cloud.
- **Bottom-sheet pop-ups** (slide up from the bottom, drag down to close)
  instead of desktop dialogs.
- Proper spacing around phone notches and home bars.

### 2. "Install to home screen" (PWA)
Liftoff can now be installed like a native app:
- Proper app icons (including the Android "maskable" icon) and a complete app
  manifest.
- **Android/Chrome:** an "Install Liftoff" button appears.
- **iPhone/Safari:** a short "Share → Add to Home Screen" guide appears
  (Apple doesn't allow a one-tap install).

### 3. Works offline
- The app shell loads even with no connection, and any page (deep link) works
  offline.
- Cloud reads fall back to a cached copy when offline.
- A small banner tells you when you're offline ("changes save locally and sync
  when you reconnect"), plus a one-time "ready to work offline" confirmation.
- Your data was already stored locally first, so nothing is lost offline.

### 4. Push reminders (groundwork laid)
- The app can ask permission and subscribe your device to push notifications,
  and the installed app knows how to display them.
- There's a **"Push reminders"** switch in Settings. It stays disabled with a
  note until the server side is set up (see "What still needs you").
- Your existing reminders (in-app alarms + "Add to Calendar") keep working
  regardless.

### 5. Reliability clean-up (earlier in this branch)
- Cloud sync now checks for and logs errors instead of failing silently, and
  won't mark data as "saved" if a save actually failed.
- Saving to local storage is now crash-proof (e.g. Safari private mode).
- Login shows a friendly error instead of a raw pop-up.
- Stricter type-checking was turned on to catch bugs at build time.

## What was changed/updated vs. fixed afterward
After building the above, the work was self-reviewed twice (including a
senior-engineer-style inspection of every changed file). The issues found were
fixed:
- Swiped task rows now spring back to place instead of staying shoved aside.
- The Schedule page no longer overflows under the mobile tab bar.
- Removed a dead, unreachable bit of code in the mobile shell.
- "Quick add" now appears as a proper bottom sheet on phones.
- Touchscreen **desktops** correctly keep the desktop UI (no accidental phone
  layout on big screens).
- Pull-to-refresh respects "reduce motion" accessibility settings.

## Current state
- ✅ Builds cleanly; strict type-checking and linting pass.
- ✅ **Verified running in a real (headless) mobile browser:** the app loads,
  signs-in gate works, and the mobile Today/Tasks screens, bottom tabs, and the
  More sheet all render and navigate correctly. PWA manifest, icons, service
  worker, and offline fallback all serve correctly.
- ✅ No known substantial bugs. A couple of tiny cosmetic notes remain
  (deferred, not blocking): the swipe "reveal" icon isn't fully opaque at the
  exact trigger point, and the bottom-of-screen banners can stack when several
  apply at once.
- ⚠️ The fully signed-in experience on a real phone (with your Google/Supabase
  account) hasn't been tested by us — only via a simulated session — because
  that needs your real login.

## What still needs you
1. **Push reminders backend (optional).** To turn the push switch on, you need
   to generate VAPID keys, add one key to the app's environment, create a small
   database table, and deploy a Supabase function that sends the reminders.
   Step-by-step instructions are in **`docs/PUSH_SETUP.md`**. Until then,
   in-app alarms and calendar export cover reminders.
   - Note: on iPhone, push only works after installing Liftoff to the Home
     Screen (Apple's rule).
2. **Try it on your phone.** Deploy this branch (or run it), open it on a real
   device, install it, and confirm the signed-in screens feel right.

## Where things live (for developers)
- Mobile UI: `src/mobile/` (shell, screens, and the swipe/sheet/pull-to-refresh
  components). Device detection: `src/lib/useIsMobile.ts`.
- Install prompt: `src/components/InstallPrompt.tsx`. Offline banner:
  `src/components/OfflineBanner.tsx`.
- Push: client in `src/lib/push.ts`, service-worker handlers in
  `public/push-sw.js`, setup guide in `docs/PUSH_SETUP.md`.
- PWA/manifest/offline config: `vite.config.ts`. App icons: `public/pwa-*.png`
  (regenerate with `npm run gen:icons`).
- All mobile screens reuse the existing data layer (`src/store/useStore.ts`) —
  no business logic was duplicated.
