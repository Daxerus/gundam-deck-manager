import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, getToken, setToken, setUnauthorizedHandler } from './api';

export interface AuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface SetupStatus {
  needsBootstrap: boolean;
  registrationOpen: boolean;
}

interface AuthState {
  isAuthed: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  setupStatus: SetupStatus | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, inviteCode: string) => Promise<void>;
  bootstrap: (appPassword: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSetupStatus: () => Promise<SetupStatus>;
}

const AuthContext = createContext<AuthState | null>(null);

type SessionResponse = { token: string; user: AuthUser };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [isAuthed, setIsAuthed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsAuthed(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setIsAuthed(false);
      qc.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const refreshSetupStatus = useCallback(async () => {
    const status = await apiFetch<SetupStatus>('/auth/setup-status');
    setSetupStatus(status);
    return status;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        await refreshSetupStatus();
      } catch {
        /* offline / worker down — leave status null */
      }

      const token = getToken();
      if (!token) {
        if (!cancelled) {
          setIsAuthed(false);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const me = await apiFetch<{ user: AuthUser }>('/auth/me');
        if (!cancelled) {
          setUser(me.user);
          setIsAuthed(true);
        }
      } catch (err) {
        if (!cancelled) {
          clearSession();
          if (!(err instanceof ApiError && err.status === 401)) {
            /* keep cleared session */
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSetupStatus]);

  async function applySession(res: SessionResponse) {
    setToken(res.token);
    setUser(res.user);
    setIsAuthed(true);
    qc.clear();
    try {
      await refreshSetupStatus();
    } catch {
      /* ignore */
    }
  }

  async function login(username: string, password: string) {
    const res = await apiFetch<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    await applySession(res);
  }

  async function register(username: string, password: string, inviteCode: string) {
    const res = await apiFetch<SessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, inviteCode }),
    });
    await applySession(res);
  }

  async function bootstrap(appPassword: string, username: string, password: string) {
    const res = await apiFetch<SessionResponse>('/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ appPassword, username, password }),
    });
    await applySession(res);
  }

  function logout() {
    clearSession();
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthed,
        isLoading,
        user,
        setupStatus,
        login,
        register,
        bootstrap,
        logout,
        refreshSetupStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
