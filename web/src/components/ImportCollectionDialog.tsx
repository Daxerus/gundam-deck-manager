import { useMemo, useState } from 'react';
import { Panel, HudButton } from './hud';
import { IMPORT_LIST_EXAMPLE, parseDeckText } from '../lib/deckImport';
import { api, ApiError } from '../lib/api';
import { useCollection } from '../lib/queries';
import type { CollectionDraft } from '../lib/useCollectionDraft';

type ImportMode = 'add' | 'set';

type ResolvedCard = {
  code: string;
  productId: string;
  cardNumber: string;
  name: string;
};

export function ImportCollectionDialog({
  draft,
  onClose,
  onDone,
}: {
  draft: CollectionDraft;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const collection = useCollection();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ImportMode>('add');
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseDeckText(text) : null), [text]);

  async function apply() {
    if (!parsed || parsed.cards.size === 0) {
      setError('No se ha detectado ninguna carta válida.');
      return;
    }
    if (!collection.isSuccess) {
      setError('La colección aún se está cargando.');
      return;
    }

    setBusy(true);
    setError(null);
    setMissing([]);
    try {
      const resolved = await api.post<{ data: ResolvedCard[]; missing: string[] }>('/cards/resolve', {
        codes: [...parsed.cards.keys()],
      });

      const importedByProduct = new Map<string, number>();
      for (const row of resolved.data) {
        const qty = parsed.cards.get(row.code) ?? 0;
        importedByProduct.set(row.productId, (importedByProduct.get(row.productId) ?? 0) + qty);
      }
      if (importedByProduct.size === 0) {
        setMissing(resolved.missing);
        setError('Ningún código de la lista está en el catálogo.');
        setBusy(false);
        return;
      }

      const entries = [...importedByProduct].map(([productId, qty]) => ({
        productId,
        quantity: mode === 'add' ? draft.ownedOf(productId) + qty : qty,
      }));
      const saved = await draft.applyOwned(entries);
      if (!saved) {
        setError('No se pudo guardar la colección.');
        setBusy(false);
        return;
      }

      const copies = [...importedByProduct.values()].reduce((sum, qty) => sum + qty, 0);
      const message = `Importadas ${importedByProduct.size} cartas · ${copies} copias${
        resolved.missing.length ? ` · ${resolved.missing.length} códigos sin catálogo` : ''
      }`;
      setMissing(resolved.missing);
      setDone(true);
      onDone(message);
      if (resolved.missing.length === 0) onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo importar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Panel title="Importar colección externa" subtitle="Gundex, ExBurst y otras listas de texto">
          <p className="mb-3 font-ui text-sm text-muted">
            Pega una lista. El nombre se ignora; solo cuentan la cantidad y el código. Un código solo
            vale 1 copia. Si hay varias impresiones, se usa la impresión base. Las cartas que no estén
            en la lista no se borran.
          </p>
          <textarea
            className="hud-input min-h-56 w-full resize-y font-mono text-[12px] leading-relaxed"
            placeholder={IMPORT_LIST_EXAMPLE}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDone(false);
              setMissing([]);
            }}
            spellCheck={false}
            disabled={busy}
          />
          <div className="mt-3 flex flex-col gap-2 font-ui text-sm text-ink">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="collection-import-mode"
                checked={mode === 'add'}
                onChange={() => setMode('add')}
                disabled={busy || done}
              />
              Sumar a lo que ya tengo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="collection-import-mode"
                checked={mode === 'set'}
                onChange={() => setMode('set')}
                disabled={busy || done}
              />
              Fijar la cantidad de estas cartas
            </label>
          </div>
          {parsed && (
            <p className="mt-2 font-mono text-[12px] text-muted">
              {parsed.distinctCards} cartas distintas · {parsed.totalCopies} copias
              {parsed.skipped.length > 0 ? (
                <span className="text-amber"> · {parsed.skipped.length} líneas omitidas</span>
              ) : null}
            </p>
          )}
          {parsed && parsed.skipped.length > 0 && (
            <ul className="mt-1 max-h-24 overflow-auto font-mono text-[11px] text-amber">
              {parsed.skipped.slice(0, 8).map((s) => (
                <li key={`${s.line}-${s.raw}`}>
                  L{s.line}: {s.reason} — {s.raw}
                </li>
              ))}
              {parsed.skipped.length > 8 && <li>… y {parsed.skipped.length - 8} más</li>}
            </ul>
          )}
          {missing.length > 0 && (
            <ul className="mt-2 max-h-24 overflow-auto font-mono text-[11px] text-amber">
              {missing.slice(0, 8).map((code) => (
                <li key={code}>{code} no está en el catálogo</li>
              ))}
              {missing.length > 8 && <li>… y {missing.length - 8} más</li>}
            </ul>
          )}
          {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!done && (
              <HudButton
                variant="ok"
                onClick={() => void apply()}
                disabled={busy || !parsed?.cards.size || !collection.isSuccess}
              >
                {busy ? 'Importando…' : 'Importar y guardar'}
              </HudButton>
            )}
            <HudButton variant="ghost" onClick={onClose} disabled={busy}>
              {done ? 'Cerrar' : 'Cancelar'}
            </HudButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
