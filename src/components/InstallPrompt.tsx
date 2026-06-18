import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import { safeSetItem } from '../lib/utils';
import { BottomSheet } from '../mobile/components/BottomSheet';

const DISMISS_KEY = 'liftoff_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

// Promotes installing Liftoff to the home screen. Android/Chromium uses the
// native beforeinstallprompt; iOS Safari (which never fires it) gets a sheet
// explaining the manual Share → Add to Home Screen flow.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosSheet, setIosSheet] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt — surface the manual banner instead.
    if (isIOS()) setVisible(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    safeSetItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
    } else if (isIOS()) {
      setIosSheet(true);
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 md:left-auto md:right-6 md:bottom-6 md:max-w-sm">
        <div className="card flex items-center gap-3 p-3 shadow-lg">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-on-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">Install Liftoff</p>
            <p className="text-xs text-ink-muted">Add it to your home screen for an app-like experience.</p>
          </div>
          <button onClick={install} className="btn btn-primary text-xs py-2 px-3 shrink-0">
            Install
          </button>
          <button onClick={dismiss} aria-label="Dismiss" className="p-1 text-ink-subtle hover:text-ink shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <BottomSheet open={iosSheet} onClose={() => setIosSheet(false)} title="Add Liftoff to your Home Screen">
        <ol className="space-y-4 text-sm text-ink">
          <li className="flex items-center gap-3">
            <Share className="w-5 h-5 text-primary shrink-0" />
            <span>Tap the <strong>Share</strong> button in Safari's toolbar.</span>
          </li>
          <li className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-primary shrink-0" />
            <span>Choose <strong>Add to Home Screen</strong>.</span>
          </li>
          <li className="flex items-center gap-3">
            <Download className="w-5 h-5 text-primary shrink-0" />
            <span>Tap <strong>Add</strong> — Liftoff will launch like a native app.</span>
          </li>
        </ol>
        <button onClick={() => { setIosSheet(false); dismiss(); }} className="btn btn-secondary w-full mt-6">
          Got it
        </button>
      </BottomSheet>
    </>
  );
}
