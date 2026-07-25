import { Panel, StatusBadge } from '../components/hud';
import { useShopping } from '../lib/queries';

export function ShoppingList() {
  const shopping = useShopping();
  const rows = shopping.data ?? [];
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0);

  return (
    <div className="space-y-4">
      <Panel
        title="Procurement // Lista de compra"
        tone={rows.length ? 'amber' : 'ok'}
        subtitle="Cartas que te faltan para poder montar tus decks"
        right={
          rows.length ? (
            <StatusBadge tone="amber">{totalMissing} copias</StatusBadge>
          ) : (
            <StatusBadge tone="ok">Completo</StatusBadge>
          )
        }
      >
        <p className="font-ui text-[13px] text-muted">
          Para cada carta se muestra cuántas necesitas como máximo (el deck que más pide), cuántas tienes y
          cuántas faltan por comprar.
        </p>
      </Panel>

      {shopping.isLoading && <p className="font-mono text-sm text-muted">Calculando…</p>}

      {rows.length === 0 && !shopping.isLoading && (
        <Panel tone="ok">
          <p className="font-ui text-ink">
            ¡No te falta nada! Tienes copias suficientes para montar todos tus decks (uno a uno).
          </p>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel bodyClassName="p-0">
          <div className="overflow-auto">
            <table className="w-full font-mono text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="p-2">Carta</th>
                  <th className="px-3">Nº</th>
                  <th className="px-3">Tengo</th>
                  <th className="px-3">Máx. pide</th>
                  <th className="px-3">Faltan</th>
                  <th className="px-3">Decks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cardNumber} className="border-b border-line/50">
                    <td className="p-2 text-ink">{r.name}</td>
                    <td className="px-3 text-muted">{r.cardNumber}</td>
                    <td className="px-3 text-hud">{r.owned}</td>
                    <td className="px-3 text-muted">{r.maxRequired}</td>
                    <td className="px-3 font-bold text-alert">+{r.missing}</td>
                    <td className="px-3 text-amber">{r.decks.map((d) => d.name).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
