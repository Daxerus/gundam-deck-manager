const TOKEN_KEY = 'gcg_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Register a callback fired when any API call returns 401 (token cleared). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...opts, headers });

  if (res.status === 401) {
    setToken(null);
    unauthorizedHandler?.();
    const text = await res.text();
    let message = 'No autorizado';
    try {
      const json = text ? JSON.parse(text) : null;
      if (json?.error) message = json.error as string;
    } catch {
      /* ignore */
    }
    throw new ApiError(401, message);
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (json && (json.error as string)) || `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
