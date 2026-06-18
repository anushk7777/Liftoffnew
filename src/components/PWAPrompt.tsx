import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Check } from 'lucide-react';

export default function PWAPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error('SW registration error', error);
    },
  });

  // "Ready to work offline" confirmation (shown once, dismissible).
  if (offlineReady && !needRefresh) {
    return (
      <div className="fixed bottom-20 md:bottom-5 left-5 z-50 card shadow-lg p-3 flex items-center gap-3 max-w-sm w-[calc(100%-2.5rem)] md:w-auto animate-rise">
        <Check className="w-4 h-4 text-accent shrink-0" />
        <p className="text-sm text-ink flex-1">Liftoff is ready to work offline.</p>
        <button onClick={() => setOfflineReady(false)} aria-label="Dismiss" className="p-1 text-ink-muted hover:text-ink transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 left-5 z-50 card shadow-lg p-3 flex items-center gap-4 max-w-sm w-[calc(100%-2.5rem)] md:w-auto animate-rise">
      <div className="flex items-center gap-3 flex-1">
        <RefreshCw className="w-4 h-4 text-ink-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">Update available</p>
          <p className="text-xs text-ink-muted">A new version is ready.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => updateServiceWorker(true)} className="btn btn-primary text-xs py-1.5 px-3">
          Refresh
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="p-1 text-ink-muted hover:text-ink transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
