import { useState } from 'react';
import { Panel } from './hud';
import { useReturnLoan } from '../lib/queries';
import { ApiError } from '../lib/api';

export function ReturnLoanDialog({
  loanId,
  productId,
  maxQty,
  username,
  onClose,
}: {
  loanId: number;
  productId: string;
  maxQty: number;
  username: string;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(maxQty);
  const [error, setError] = useState<string | null>(null);
  const ret = useReturnLoan();

  async function submit(amount: number) {
    setError(null);
    try {
      await ret.mutateAsync({
        loanId,
        items: [{ productId, quantity: amount }],
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo devolver');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Panel title="Devolver préstamo" subtitle={`${productId} · ${username}`}>
          <p className="mb-3 font-ui text-sm text-muted">
            Pendiente: <span className="text-ink">x{maxQty}</span>. Elige cuántas copias devolver.
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Cantidad</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              className="hud-input"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
            />
          </label>
          {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ret.isPending}
              onClick={() => void submit(qty)}
              className="border border-hud/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-hud hover:bg-hud/10 disabled:opacity-40"
            >
              Devolver {qty}
            </button>
            {qty !== maxQty && (
              <button
                type="button"
                disabled={ret.isPending}
                onClick={() => void submit(maxQty)}
                className="border border-ok/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-ok hover:bg-ok/10 disabled:opacity-40"
              >
                Todo (x{maxQty})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="border border-line px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
