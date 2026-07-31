import { useState } from 'react';
import { Panel } from './hud';
import {
  ExternalContactPicker,
  selectionToPayload,
  type ContactSelection,
} from './ExternalContactPicker';
import { useCreateExternalLoan } from '../lib/queries';
import { ApiError } from '../lib/api';
import type { Card } from '../lib/types';

export function ReceiveCardDialog({
  card,
  onClose,
  onDone,
}: {
  card: Card;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const createExternal = useCreateExternalLoan();
  const [contactSel, setContactSel] = useState<ContactSelection | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!contactSel && (contactSel.mode === 'existing' || !!contactSel.nick);

  async function submit() {
    if (!contactSel) return;
    setError(null);
    try {
      const result = await createExternal.mutateAsync({
        ...selectionToPayload(contactSel),
        direction: 'borrowed',
        items: [{ productId: card.productId, quantity: qty }],
      });
      const nick = result.contactNick ?? contactSel.nick;
      onDone(`Registrado x${qty} ${card.cardNumber} prestado por ${nick}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Panel title="Recibir prestado" subtitle={`${card.name} · ${card.cardNumber}`}>
          <p className="mb-3 font-ui text-sm text-muted">
            Marca que un usuario no registrado te ha prestado esta carta. Se añade a tu colección sin
            confirmación.
          </p>

          <ExternalContactPicker value={contactSel} onChange={setContactSel} />

          <label className="mt-3 flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
              Cantidad
            </span>
            <input
              type="number"
              min={1}
              max={99}
              className="hud-input w-24"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>

          {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={createExternal.isPending || !canSubmit}
              onClick={() => void submit()}
              className="border border-borrow/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-borrow hover:bg-borrow/10 disabled:opacity-40"
            >
              Registrar x{qty}
            </button>
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
