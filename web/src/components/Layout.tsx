import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useStatus, useSyncCatalog } from '../lib/queries';
import { ApiError } from '../lib/api';

const NAV = [
  { to: '/', label: 'Catálogo', end: true },
  { to: '/collection', label: 'Colección' },
  { to: '/decks', label: 'Decks' },
  { to: '/active', label: 'Activos' },
  { to: '/shopping', label: 'Compra' },
];

export function Layout() {
  const { logout, user } = useAuth();
  const status = useStatus();
  const sync = useSyncCatalog();
  const clock = useClock();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function runSync() {
    setSyncMsg(null);
    try {
      const res = await sync.mutateAsync();
      setSyncMsg(`Sync OK · ${res.cardCount} cartas`);
    } catch (err) {
      setSyncMsg(err instanceof ApiError ? err.message : 'Sync falló');
    }
  }

  return (
    <div className="scanlines flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-hud/20 bg-void/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="animate-flicker font-display text-lg font-bold tracking-[0.15em] text-hud">GCG</span>
            <span className="font-display text-[10px] uppercase tracking-[0.3em] text-muted">
              // Deck Manager
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-3 py-1 font-display text-[11px] uppercase tracking-[0.16em] transition-colors ${
                    isActive ? 'border-b-2 border-hud text-hud' : 'border-b-2 border-transparent text-muted hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 font-mono text-[10px] text-muted">
            {user && (
              <span className="hidden sm:inline">
                PILOT <span className="text-hud">{user.username}</span>
                {user.isAdmin && <span className="ml-1 text-amber">ADMIN</span>}
              </span>
            )}
            <span className="hidden sm:inline">
              DS <span className="text-hud">{status.data?.datasetVersion?.slice(0, 6) ?? '----'}</span>
            </span>
            <span className="hidden sm:inline">
              CARDS <span className="text-hud">{status.data?.cardCount ?? '----'}</span>
            </span>
            {user?.isAdmin && (
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={sync.isPending}
                className="border border-hud/40 px-2 py-0.5 uppercase tracking-[0.16em] text-hud hover:bg-hud/10 disabled:opacity-40"
                title="Descargar catálogo desde gcg-api"
              >
                {sync.isPending ? 'Sync…' : 'Sync'}
              </button>
            )}
            <span className="tabular-nums text-ink">{clock}</span>
            <span className="flex items-center gap-1 text-ok">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ok" /> LINK
            </span>
            <button
              onClick={logout}
              className="border border-line px-2 py-0.5 uppercase tracking-[0.16em] text-muted hover:border-alert/50 hover:text-alert"
            >
              Salir
            </button>
          </div>
        </div>
        {syncMsg && (
          <div className="border-t border-line/40 px-4 py-1 text-center font-mono text-[10px] text-hud">
            {syncMsg}
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line/60 px-4 py-3 text-center font-mono text-[10px] leading-relaxed text-muted/70">
        Contains data from gcg-api (https://gcgapi.com), Open Database License (ODbL) v1.0. · No afiliado a
        Bandai. Gundam y las imágenes de cartas son © Bandai.
      </footer>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => fmt(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(fmt(new Date())), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmt(d: Date) {
  return d.toLocaleTimeString('es-ES', { hour12: false });
}
