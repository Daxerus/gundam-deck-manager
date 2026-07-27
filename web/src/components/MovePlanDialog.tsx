import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HudButton, TerminalLog, type LogLine } from './hud';
import type { ActivationPlan, PullPreference } from '../lib/types';

type SourceKey = `${number}:${string}`;

function sourceKey(deckId: number, productId: string): SourceKey {
  return `${deckId}:${productId}`;
}

function initialSources(plan: ActivationPlan): Record<string, SourceKey[]> {
  const initial: Record<string, SourceKey[]> = {};
  for (const option of plan.pullOptions) {
    const selected: SourceKey[] = [];
    for (const move of plan.moves) {
      if (move.from === 'box') continue;
      const from = move.from;
      const match = option.holders.find(
        (holder) => holder.deckId === from.deckId && holder.productId === move.productId,
      );
      if (!match) continue;
      for (let i = 0; i < move.qty; i += 1) selected.push(sourceKey(match.deckId, match.productId));
    }
    if (selected.length !== option.qty) {
      selected.length = 0;
      for (const holder of option.holders) {
        for (let i = 0; i < holder.qty && selected.length < option.qty; i += 1) {
          selected.push(sourceKey(holder.deckId, holder.productId));
        }
      }
    }
    initial[option.cardNumber] = selected;
  }
  return initial;
}

export function planToLog(plan: ActivationPlan): LogLine[] {
  const configurableCards = new Set(plan.pullOptions.map((option) => option.cardNumber));
  const lines: LogLine[] = [
    { text: `SECUENCIA DE MONTAJE // ${plan.targetName}`, tone: 'hud' },
  ];
  if (!plan.allowBox) {
    lines.push({ text: 'modo sin colección — solo decks accesibles', tone: 'amber' });
  }
  if (plan.moves.length === 0 && plan.pullOptions.length === 0) {
    lines.push({
      text: plan.shortages.length
        ? 'sin movimientos posibles — faltan copias'
        : 'sin movimientos necesarios — deck ya ensamblado',
      tone: plan.shortages.length ? 'amber' : 'muted',
    });
  }
  for (const m of plan.moves) {
    const cardNumber = plan.pullOptions.find((option) =>
      option.holders.some((holder) => holder.productId === m.productId),
    )?.cardNumber;
    if (m.from !== 'box' && cardNumber && configurableCards.has(cardNumber)) continue;
    if (m.from === 'box') {
      lines.push({ text: `RETIRAR ${m.qty}x ${m.name} ← COLECCION`, tone: 'ok' });
    } else {
      lines.push({ text: `EXTRAER ${m.qty}x ${m.name} ← [Deck ${m.from.name}]`, tone: 'amber' });
    }
  }
  for (const option of plan.pullOptions) {
    lines.push({ text: `ELEGIR ORIGEN DE ${option.qty}x ${option.name}`, tone: 'amber' });
  }
  for (const a of plan.affectedDecks) {
    lines.push({ text: `⚠ [Deck ${a.name}] queda INCOMPLETO y se desactiva`, tone: 'amber' });
  }
  for (const s of plan.shortages) {
    if (!plan.allowBox && s.owned >= s.required) {
      lines.push({
        text: `✖ ${s.missing}x ${s.name} solo en colección (inaccesible ahora)`,
        tone: 'alert',
      });
    } else if (!plan.allowBox && s.owned > 0) {
      lines.push({
        text: `✖ FALTAN ${s.missing}x ${s.name} — parte puede estar en colección`,
        tone: 'alert',
      });
    } else {
      lines.push({ text: `✖ FALTAN ${s.missing}x ${s.name} (${s.cardNumber})`, tone: 'alert' });
    }
  }
  lines.push(
    plan.complete
      ? { text: 'MONTAJE COMPLETO ✓', tone: 'ok' }
      : { text: 'MONTAJE PARCIAL — faltan copias accesibles', tone: 'amber' },
  );
  return lines;
}

export function MovePlanDialog({
  plan,
  busy,
  onConfirm,
  onCancel,
  onAllowBoxChange,
}: {
  plan: ActivationPlan;
  busy: boolean;
  onConfirm: (preferences: PullPreference[], allowBox: boolean) => void;
  onCancel: () => void;
  onAllowBoxChange: (allowBox: boolean) => Promise<void>;
}) {
  const lines = useMemo(() => planToLog(plan), [plan]);
  const [revealed, setRevealed] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sources, setSources] = useState<Record<string, SourceKey[]>>(() => initialSources(plan));

  useEffect(() => {
    setSources(initialSources(plan));
    setRevealed(false);
  }, [plan]);

  const preferences = useMemo<PullPreference[]>(
    () =>
      plan.pullOptions.map((option) => {
        const counts = new Map<SourceKey, number>();
        for (const key of sources[option.cardNumber] ?? []) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return {
          cardNumber: option.cardNumber,
          pulls: [...counts].map(([key, qty]) => {
            const [deckId, productId] = key.split(':');
            return { deckId: Number(deckId), productId, qty };
          }),
        };
      }),
    [plan.pullOptions, sources],
  );

  function selectSource(cardNumber: string, copyIndex: number, key: SourceKey) {
    setSources((current) => ({
      ...current,
      [cardNumber]: (current[cardNumber] ?? []).map((value, index) =>
        index === copyIndex ? key : value,
      ),
    }));
  }

  async function toggleAllowBox() {
    const next = !plan.allowBox;
    setToggling(true);
    try {
      await onAllowBoxChange(next);
    } finally {
      setToggling(false);
    }
  }

  const locked = busy || toggling;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-hud/40 bg-panel/95 p-4 shadow-hud-strong"
      >
        <h2 className="mb-3 font-display text-sm uppercase tracking-[0.2em] text-hud">// System Swap</h2>
        <TerminalLog
          lines={lines}
          intervalMs={45}
          characterIntervalMs={8}
          onDone={() => setRevealed(true)}
        />

        <label className="mt-4 flex cursor-pointer items-start gap-3 border border-line/60 bg-void/40 px-3 py-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--hud)]"
            checked={!plan.allowBox}
            disabled={locked}
            onChange={() => void toggleAllowBox()}
          />
          <span>
            <span className="block font-mono text-[12px] text-ink">
              Sin acceso a la colección
            </span>
            <span className="block font-mono text-[10px] text-muted">
              Extrae solo desde decks (útil si estás fuera y la caja está en casa).
            </span>
          </span>
        </label>

        {plan.pullOptions.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="font-display text-[11px] uppercase tracking-[0.16em] text-amber">
              // Elige el deck de origen por identidad
            </p>
            {plan.pullOptions.map((option) => {
              const selected = sources[option.cardNumber] ?? [];
              const selectedCounts = new Map<SourceKey, number>();
              for (const key of selected) {
                selectedCounts.set(key, (selectedCounts.get(key) ?? 0) + 1);
              }
              return (
                <div key={option.cardNumber} className="border border-amber/30 bg-void/40 p-3">
                  <p className="font-mono text-[12px] text-ink">
                    {option.name}{' '}
                    <span className="text-muted">({option.cardNumber})</span>
                  </p>
                  <p className="mb-2 font-mono text-[10px] text-muted">
                    {plan.allowBox
                      ? `La colección aporta el máximo disponible. Elige de dónde sacar las ${option.qty} ${option.qty === 1 ? 'copia restante' : 'copias restantes'}.`
                      : `Colección deshabilitada. Elige de qué deck sacar las ${option.qty} ${option.qty === 1 ? 'copia' : 'copias'}.`}
                  </p>
                  <div className="space-y-2">
                    {Array.from({ length: option.qty }, (_, copyIndex) => (
                      <label
                        key={copyIndex}
                        className="flex items-center justify-between gap-3 font-mono text-[11px] text-muted"
                      >
                        <span>Copia {copyIndex + 1}</span>
                        <select
                          className="hud-input min-w-0 flex-1 font-mono text-[11px]"
                          value={selected[copyIndex] ?? ''}
                          disabled={locked}
                          onChange={(event) =>
                            selectSource(option.cardNumber, copyIndex, event.target.value as SourceKey)
                          }
                        >
                          {option.holders.map((holder) => {
                            const key = sourceKey(holder.deckId, holder.productId);
                            const used = selectedCounts.get(key) ?? 0;
                            const isCurrent = selected[copyIndex] === key;
                            const printing =
                              holder.productId !== option.cardNumber ? ` · ${holder.productId}` : '';
                            return (
                              <option key={key} value={key} disabled={!isCurrent && used >= holder.qty}>
                                Deck {holder.name} ({holder.qty} disp.{printing})
                                {holder.isActive ? ' · activo' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-amber">
                    Se extraerá:{' '}
                    {option.holders
                      .map((holder) => {
                        const key = sourceKey(holder.deckId, holder.productId);
                        const count = selectedCounts.get(key) ?? 0;
                        if (count <= 0) return null;
                        return `Deck ${holder.name} ×${count}`;
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {option.holders.some(
                    (holder) =>
                      holder.isActive && (selectedCounts.get(sourceKey(holder.deckId, holder.productId)) ?? 0) > 0,
                  ) && (
                    <p className="mt-1 font-mono text-[10px] text-alert">
                      Los decks activos seleccionados quedarán incompletos y se desactivarán.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <HudButton variant="ghost" onClick={onCancel} disabled={locked}>
            Cancelar
          </HudButton>
          <HudButton
            variant={plan.complete ? 'ok' : 'amber'}
            onClick={() => onConfirm(preferences, plan.allowBox)}
            disabled={locked || !revealed}
          >
            {busy ? 'Aplicando…' : toggling ? 'Recalculando…' : 'Confirmar montaje'}
          </HudButton>
        </div>
      </motion.div>
    </div>
  );
}
