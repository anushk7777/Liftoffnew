import { useSyncExternalStore } from 'react';
import { CloudOff } from 'lucide-react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

// True when the browser reports no network. The store is local-first, so the
// app keeps working; this just tells the user cloud sync is paused.
function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[80] flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-warning/20 text-warning backdrop-blur-md pt-[calc(env(safe-area-inset-top)+0.375rem)]">
      <CloudOff className="w-3.5 h-3.5" />
      Offline — changes save locally and sync when you reconnect.
    </div>
  );
}
