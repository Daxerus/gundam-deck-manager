import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Panel } from '../components/hud';
import { useAuth } from '../lib/auth';
import { useGenerateInviteCodes, useInviteCodes } from '../lib/queries';
import { ApiError } from '../lib/api';

export function AdminInvites() {
  const { user } = useAuth();
  const codes = useInviteCodes();
  const generate = useGenerateInviteCodes();
  const [count, setCount] = useState(5);
  const [created, setCreated] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function onGenerate() {
    setError(null);
    try {
      const res = await generate.mutateAsync(count);
      setCreated(res.codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron generar códigos');
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Admin // Invitaciones" subtitle="Códigos de un solo uso">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
              Cantidad
            </span>
            <input
              type="number"
              min={1}
              max={50}
              className="hud-input w-20"
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </label>
          <button
            type="button"
            disabled={generate.isPending}
            onClick={() => void onGenerate()}
            className="border border-hud/50 px-3 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-hud hover:bg-hud/10 disabled:opacity-40"
          >
            {generate.isPending ? 'Generando…' : 'Generar códigos'}
          </button>
        </div>
        {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}
        {created.length > 0 && (
          <div className="mt-3 border border-ok/30 bg-ok/5 p-3">
            <p className="mb-2 font-display text-[10px] uppercase tracking-[0.16em] text-ok">
              Recién creados — cópialos ahora
            </p>
            <ul className="space-y-1 font-mono text-sm text-ink">
              {created.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title="Códigos" subtitle={`${(codes.data ?? []).length} registrados`}>
        {codes.isLoading && <p className="font-mono text-sm text-muted">Cargando…</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[12px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Creado</th>
                <th className="py-2">Usado</th>
              </tr>
            </thead>
            <tbody>
              {(codes.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-line/40">
                  <td className="py-2 pr-3 text-ink">{row.code}</td>
                  <td className="py-2 pr-3">
                    {row.used ? (
                      <span className="text-muted">Usado</span>
                    ) : (
                      <span className="text-ok">Disponible</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {new Date(row.createdAt * 1000).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-muted">
                    {row.usedAt ? new Date(row.usedAt * 1000).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
