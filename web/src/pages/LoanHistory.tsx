import { useState, type ReactNode } from 'react';
import { Panel } from '../components/hud';
import { CardImage } from '../components/CardTile';
import {
  useAcceptCardRequest,
  useCard,
  useCardRequests,
  useCreateReturnRequest,
  useLoanHistory,
  useOpenLoans,
  useRejectCardRequest,
  useReturnLoan,
} from '../lib/queries';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoanHistory() {
  const { user } = useAuth();
  const history = useLoanHistory();
  const open = useOpenLoans();
  const requests = useCardRequests();
  const acceptReq = useAcceptCardRequest();
  const rejectReq = useRejectCardRequest();
  const returnLoan = useReturnLoan();
  const createReturnReq = useCreateReturnRequest();
  const [msg, setMsg] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewCard = useCard(previewId);

  async function run(action: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await action();
      setMsg(ok);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="relative space-y-4">
      <div className="pointer-events-none absolute right-0 top-0 z-[40] w-44 sm:w-52">
        {previewId && previewCard.data && (
          <div
            key={previewCard.data.productId}
            className="animate-card-preview-in border border-hud/50 bg-void p-1 shadow-hud-strong"
          >
            <div className="aspect-[5/7] w-full overflow-hidden">
              <CardImage card={previewCard.data} width={500} />
            </div>
            <div className="px-1 py-1 font-mono text-[10px] text-muted">
              {previewCard.data.cardNumber}
              {previewCard.data.productId !== previewCard.data.cardNumber
                ? ` · ${previewCard.data.productId}`
                : ''}
            </div>
          </div>
        )}
      </div>

      <Panel title="Préstamos" subtitle="Abiertos · solicitudes · historial">
        {msg && <p className="font-mono text-[12px] text-hud">{msg}</p>}
      </Panel>

      {(requests.data ?? []).length > 0 && (
        <Panel title="Solicitudes de cartas" tone="amber">
          <ul className="divide-y divide-line/60">
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="font-mono text-sm text-ink">
                  {r.direction === 'incoming' ? (
                    <>
                      <span className="text-hud">{r.fromUsername}</span> pide{' '}
                      <span className="text-ok">x{r.quantity}</span>{' '}
                      <CardRef productId={r.productId} onPreview={setPreviewId} />
                    </>
                  ) : (
                    <>
                      Pediste a <span className="text-hud">{r.toUsername}</span>{' '}
                      <span className="text-ok">x{r.quantity}</span>{' '}
                      <CardRef productId={r.productId} onPreview={setPreviewId} />
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {r.direction === 'incoming' && (
                    <>
                      <button
                        type="button"
                        className="border border-ok/40 px-2 py-0.5 font-display text-[10px] uppercase text-ok"
                        onClick={() =>
                          void run(() => acceptReq.mutateAsync(r.id), 'Préstamo confirmado')
                        }
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        className="border border-alert/40 px-2 py-0.5 font-display text-[10px] uppercase text-alert"
                        onClick={() => void run(() => rejectReq.mutateAsync(r.id), 'Rechazada')}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  {r.direction === 'outgoing' && (
                    <button
                      type="button"
                      className="border border-line px-2 py-0.5 font-display text-[10px] uppercase text-muted"
                      onClick={() => void run(() => rejectReq.mutateAsync(r.id), 'Cancelada')}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Préstamos abiertos" subtitle={`${(open.data ?? []).length} activos`}>
        {open.isLoading && <p className="font-mono text-sm text-muted">Cargando…</p>}
        {(open.data ?? []).length === 0 && !open.isLoading && (
          <p className="font-mono text-sm text-muted">No hay préstamos abiertos.</p>
        )}
        <ul className="space-y-3">
          {(open.data ?? []).map((loan) => (
            <li key={loan.id} className="border border-line/60 bg-panel-2/40 p-3">
              <div className="font-ui text-sm text-ink">
                <span className="text-loan">{loan.lenderUsername}</span>
                <span className="text-muted"> → </span>
                <span className="text-borrow">{loan.borrowerUsername}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {loan.items.map((it) => (
                  <li
                    key={it.productId}
                    className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px]"
                  >
                    <span>
                      x{it.quantity} <CardRef productId={it.productId} onPreview={setPreviewId} />
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="border border-hud/40 px-2 py-0.5 font-display text-[10px] uppercase text-hud"
                        onClick={() =>
                          void run(
                            () =>
                              returnLoan.mutateAsync({
                                loanId: loan.id,
                                items: [{ productId: it.productId, quantity: it.quantity }],
                              }),
                            'Devolución registrada',
                          )
                        }
                      >
                        Devolver todo
                      </button>
                      {user && (user.id === loan.lenderId || user.id === loan.borrowerId) && (
                        <button
                          type="button"
                          className="border border-amber/40 px-2 py-0.5 font-display text-[10px] uppercase text-amber"
                          onClick={() =>
                            void run(
                              () =>
                                createReturnReq.mutateAsync({
                                  loanId: loan.id,
                                  productId: it.productId,
                                  quantity: it.quantity,
                                }),
                              'Solicitud de devolución enviada',
                            )
                          }
                        >
                          Solicitar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Historial" subtitle="Transacciones entre pilotos">
        {history.isLoading && <p className="font-mono text-sm text-muted">Cargando…</p>}
        {(history.data ?? []).length === 0 && !history.isLoading && (
          <p className="font-mono text-sm text-muted">Sin transacciones todavía.</p>
        )}
        <ul className="divide-y divide-line/60">
          {(history.data ?? []).map((tx) => (
            <li key={tx.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-[11px] uppercase tracking-[0.16em] text-hud">
                  {tx.type === 'lend' ? 'Préstamo' : 'Devolución'}
                  <span className="ml-2 text-muted">· {tx.direction}</span>
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {new Date(tx.createdAt * 1000).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 font-ui text-sm text-ink">
                {tx.fromUsername} → {tx.toUsername}
              </p>
              <p className="font-mono text-[12px] text-muted">
                {tx.items.map((i, idx) => (
                  <span key={`${tx.id}-${i.productId}`}>
                    {idx > 0 ? ' · ' : null}
                    x{i.quantity} <CardRef productId={i.productId} onPreview={setPreviewId} />
                  </span>
                ))}
              </p>
              {tx.deckImpacts.length > 0 && (
                <p className="mt-1 font-mono text-[12px] text-alert">
                  Esta transacción ha dejado incompleto
                  {tx.deckImpacts.length === 1 ? ' el deck' : ' los decks'}{' '}
                  {tx.deckImpacts.map((d) => `"${d.name}"`).join(', ')}.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function CardRef({
  productId,
  onPreview,
}: {
  productId: string;
  onPreview: (productId: string | null) => void;
}): ReactNode {
  return (
    <span
      className="cursor-default text-hud underline decoration-hud/30 underline-offset-2 transition-colors hover:text-hud-glow hover:decoration-hud"
      onMouseEnter={() => onPreview(productId)}
      onMouseLeave={() => onPreview(null)}
    >
      {productId}
    </span>
  );
}
