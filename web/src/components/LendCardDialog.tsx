import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from './hud';
import {
  ExternalContactPicker,
  selectionToPayload,
  type ContactSelection,
} from './ExternalContactPicker';
import { useCreateExternalLoan, useCreateLoan, useFriends } from '../lib/queries';
import { ApiError } from '../lib/api';
import type { Card } from '../lib/types';

type TargetMode = 'friend' | 'external';

export function LendCardDialog({
  card,
  maxQty,
  onClose,
  onDone,
}: {
  card: Card;
  maxQty: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const friends = useFriends();
  const createLoan = useCreateLoan();
  const createExternal = useCreateExternalLoan();
  const [targetMode, setTargetMode] = useState<TargetMode>('friend');
  const [borrowerId, setBorrowerId] = useState<number | null>(null);
  const [contactSel, setContactSel] = useState<ContactSelection | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const accepted = (friends.data ?? []).filter((f) => f.status === 'accepted');
  const borrower = accepted.find((f) => f.otherUserId === borrowerId);
  const pending = createLoan.isPending || createExternal.isPending;
  const canSubmit =
    targetMode === 'friend' ? !!borrower : !!contactSel && (contactSel.mode === 'existing' || !!contactSel.nick);

  async function submit() {
    setError(null);
    try {
      if (targetMode === 'friend') {
        if (!borrower) return;
        const result = await createLoan.mutateAsync({
          borrowerId: borrower.otherUserId,
          items: [{ productId: card.productId, quantity: qty }],
        });
        const broken = result.deckImpacts.map((d) => `"${d.name}"`).join(', ');
        onDone(
          broken
            ? `Prestado x${qty} ${card.cardNumber} a ${borrower.otherUsername} · se ha desmontado ${broken}`
            : `Prestado x${qty} ${card.cardNumber} a ${borrower.otherUsername}`,
        );
        return;
      }

      if (!contactSel) return;
      const result = await createExternal.mutateAsync({
        ...selectionToPayload(contactSel),
        direction: 'lent',
        items: [{ productId: card.productId, quantity: qty }],
      });
      const nick = result.contactNick ?? contactSel.nick;
      const broken = result.deckImpacts.map((d) => `"${d.name}"`).join(', ');
      onDone(
        broken
          ? `Prestado x${qty} ${card.cardNumber} a ${nick} · se ha desmontado ${broken}`
          : `Prestado x${qty} ${card.cardNumber} a ${nick}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo prestar');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Panel title="Prestar carta" subtitle={`${card.name} · ${card.cardNumber}`}>
          <p className="mb-3 font-ui text-sm text-muted">
            Disponibles en colección: <span className="text-ink">x{maxQty}</span>.
          </p>

          <div className="mb-3 flex gap-2">
            <ModeBtn
              active={targetMode === 'friend'}
              onClick={() => setTargetMode('friend')}
              label="Amigo registrado"
            />
            <ModeBtn
              active={targetMode === 'external'}
              onClick={() => setTargetMode('external')}
              label="No registrado"
            />
          </div>

          {targetMode === 'friend' && (
            <>
              {friends.isLoading && <p className="font-mono text-sm text-muted">Cargando amigos…</p>}
              {!friends.isLoading && accepted.length === 0 && (
                <p className="font-mono text-[12px] text-amber">
                  Todavía no tienes amigos. Añade uno en{' '}
                  <Link className="text-hud" to="/friends">
                    Amigos
                  </Link>
                  , o presta a un nick no registrado.
                </p>
              )}
              {accepted.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
                    Prestar a
                  </span>
                  <select
                    className="hud-input w-full"
                    value={borrowerId ?? ''}
                    onChange={(e) => setBorrowerId(Number(e.target.value) || null)}
                  >
                    <option value="">Elige un piloto…</option>
                    {accepted.map((f) => (
                      <option key={f.otherUserId} value={f.otherUserId}>
                        {f.otherUsername}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {targetMode === 'external' && (
            <ExternalContactPicker value={contactSel} onChange={setContactSel} />
          )}

          <label className="mt-3 flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
              Cantidad
            </span>
            <input
              type="number"
              min={1}
              max={maxQty}
              className="hud-input w-24"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
            />
          </label>

          {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !canSubmit}
              onClick={() => void submit()}
              className="border border-loan/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-loan hover:bg-loan/10 disabled:opacity-40"
            >
              Prestar x{qty}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-line px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>

          <p className="mt-3 font-mono text-[10px] text-muted">
            {targetMode === 'external'
              ? 'Sin confirmación: se marca el préstamo con tu palabra. El nick se guarda para reutilizarlo.'
              : 'Se entregan copias de cualquier edición de esta carta, empezando por las que están libres en la colección.'}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 font-display text-[10px] uppercase tracking-[0.14em] ${
        active
          ? 'border-hud/60 bg-hud/10 text-hud'
          : 'border-line text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
