export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GCG_API_BASE: string;
  /**
   * Legacy single-password used only for one-time owner bootstrap.
   * Set via `wrangler secret put APP_PASSWORD`. May be removed after bootstrap.
   */
  APP_PASSWORD?: string;
  /** Shared invite code for self-registration. Set via `wrangler secret put REGISTRATION_CODE`. */
  REGISTRATION_CODE?: string;
  /** Set via `wrangler secret put JWT_SECRET`. */
  JWT_SECRET: string;
}

/** Variables attached to the Hono context after auth. */
export interface Vars {
  jwtPayload?: { sub: string; exp: number; username?: string };
  userId?: number;
  username?: string;
  isAdmin?: boolean;
}
