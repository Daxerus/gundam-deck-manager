import { Hono } from 'hono';
import { requireAdmin, type AppEnv } from '../auth';
import { getDb } from '../db/client';
import { syncCards } from '../services/cardSync';

export const syncRoutes = new Hono<AppEnv>()
  // POST /api/admin/sync — download the gcg-api bulk dataset into D1 (admin only)
  .post('/sync', requireAdmin, async (c) => {
    const db = getDb(c.env);
    try {
      const result = await syncCards(db, c.env);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : 'sync failed' }, 502);
    }
  });
