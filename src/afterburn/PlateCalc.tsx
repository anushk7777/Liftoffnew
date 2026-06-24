import { useState } from 'react';
import { Modal } from '../components/ui';
import { platesPerSide } from './store';
import type { WeightUnit } from './types';

const PLATES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export default function PlateCalc({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: WeightUnit }) {
  const [target, setTarget] = useState('');
  const [bar, setBar] = useState(String(unit === 'kg' ? 20 : 45));

  const t = parseFloat(target);
  const b = parseFloat(bar) || 0;
  const result = Number.isFinite(t) && t > 0 ? platesPerSide(t, b, PLATES[unit]) : null;

  return (
    <Modal open={open} onClose={onClose} title="Plate calculator" maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="section-label mb-1 block">Target ({unit})</span>
            <input type="number" inputMode="decimal" autoFocus value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100" className="input" />
          </label>
          <label className="block">
            <span className="section-label mb-1 block">Bar ({unit})</span>
            <input type="number" inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value)} className="input" />
          </label>
        </div>

        {result && (
          <div className="space-y-3">
            <p className="text-sm text-ink-subtle">
              Load each side with:
            </p>
            {result.counts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {result.counts.map((c) => (
                  <span key={c.plate} className="chip !text-sm !py-1 !px-2.5 bg-accent-soft/60 text-ink border-accent/30">
                    {c.n} × {c.plate}{unit}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink">Just the bar.</p>
            )}
            {result.remaining > 0 && (
              <p className="text-xs text-[var(--accent)]">
                {result.remaining}{unit} per side can't be made with standard plates — round to the nearest loadable weight.
              </p>
            )}
            <p className="text-[11px] text-ink-subtle">Plates available: {PLATES[unit].join(', ')} {unit}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
