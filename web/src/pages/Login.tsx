import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Panel, HudButton, TerminalLog, type LogLine } from '../components/hud';

const BOOT: LogLine[] = [
  { text: 'GCG COMBAT OS v0.1 // cold boot', tone: 'muted' },
  { text: 'mounting card database ................ OK', tone: 'ok' },
  { text: 'allocation subsystem .................. OK', tone: 'ok' },
  { text: 'link to pilot terminal ................ ESTABLISHED', tone: 'hud' },
  { text: 'AUTHORIZATION REQUIRED', tone: 'amber' },
];

type Mode = 'login' | 'register' | 'bootstrap';

export function Login() {
  const { login, register, bootstrap, setupStatus, isAuthed, isLoading, refreshSetupStatus } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshSetupStatus().catch(() => undefined);
  }, [refreshSetupStatus]);

  useEffect(() => {
    if (!setupStatus) return;
    if (setupStatus.needsBootstrap) setMode('bootstrap');
    else setMode('login');
  }, [setupStatus]);

  if (!isLoading && isAuthed) {
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'bootstrap') {
        await bootstrap(appPassword, username, password);
      } else if (mode === 'register') {
        await register(username, password, inviteCode);
      } else {
        await login(username, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'ACCESO DENEGADO — credenciales incorrectas';
      setError(msg);
      setBusy(false);
    }
  }

  const title =
    mode === 'bootstrap' ? 'First Boot' : mode === 'register' ? 'New Pilot' : 'System Boot';
  const subtitle =
    mode === 'bootstrap'
      ? 'claim owner account // migrate existing data'
      : mode === 'register'
        ? 'invite-only registration'
        : 'gundam card game // deck manager';

  return (
    <div className="scanlines flex min-h-full items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Panel title={title} subtitle={subtitle} tone="hud">
          <TerminalLog lines={BOOT} onDone={() => setReady(true)} />

          {ready && (
            <motion.form
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              onSubmit={submit}
              className="mt-4 space-y-3"
            >
              {mode === 'bootstrap' && (
                <label className="block">
                  <span className="hud-label text-[10px]">Legacy passcode (APP_PASSWORD)</span>
                  <input
                    type="password"
                    autoFocus
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    className="hud-input mt-1 w-full font-mono tracking-widest"
                    placeholder="••••••••"
                    required
                  />
                </label>
              )}

              <label className="block">
                <span className="hud-label text-[10px]">Username</span>
                <input
                  type="text"
                  autoFocus={mode !== 'bootstrap'}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="hud-input mt-1 w-full font-mono"
                  placeholder="pilot_name"
                  required
                />
              </label>

              <label className="block">
                <span className="hud-label text-[10px]">Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="hud-input mt-1 w-full font-mono tracking-widest"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </label>

              {mode === 'register' && (
                <label className="block">
                  <span className="hud-label text-[10px]">Invite code</span>
                  <input
                    type="password"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="hud-input mt-1 w-full font-mono tracking-widest"
                    placeholder="••••••••"
                    required
                  />
                </label>
              )}

              {error && <p className="animate-blink font-mono text-[12px] text-alert">{error}</p>}

              <HudButton type="submit" disabled={busy || isLoading} className="w-full py-2">
                {busy
                  ? 'Verificando…'
                  : mode === 'bootstrap'
                    ? 'Claim owner account'
                    : mode === 'register'
                      ? 'Crear cuenta'
                      : 'Autorizar acceso'}
              </HudButton>

              {!setupStatus?.needsBootstrap && (
                <div className="flex justify-between pt-1 font-mono text-[11px] text-muted">
                  {mode === 'login' ? (
                    <>
                      <span />
                      {setupStatus?.registrationOpen ? (
                        <button
                          type="button"
                          className="text-hud hover:underline"
                          onClick={() => {
                            setError(null);
                            setMode('register');
                          }}
                        >
                          Registrarse con invitación →
                        </button>
                      ) : (
                        <span className="text-muted/70">Registro cerrado</span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-hud hover:underline"
                      onClick={() => {
                        setError(null);
                        setMode('login');
                      }}
                    >
                      ← Volver al login
                    </button>
                  )}
                </div>
              )}

              {mode === 'bootstrap' && (
                <p className="font-mono text-[10px] leading-relaxed text-muted">
                  Tus decks y colección actuales se asignarán a esta cuenta de administrador.
                </p>
              )}

              <p className="sr-only">
                <Link to="/">home</Link>
              </p>
            </motion.form>
          )}
        </Panel>
      </motion.div>
    </div>
  );
}
