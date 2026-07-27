import { Hono } from 'hono';
import { requireAdmin, type AppEnv } from '../auth';
import { getDb } from '../db/client';
import { syncCards } from '../services/cardSync';
import { generateInviteCodes, listInviteCodes } from '../services/invites';
import { readJson } from '../util/json';

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
  })

  .get('/invite-codes', requireAdmin, async (c) => {
    const db = getDb(c.env);
    const data = await listInviteCodes(db);
    return c.json({ data });
  })

  .post('/invite-codes', requireAdmin, async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ count?: number }>(c);
    const count = Math.max(1, Math.min(50, Math.floor(Number(body.count) || 1)));
    const codes = await generateInviteCodes(db, userId, count);
    return c.json({ data: { codes } }, 201);
  });
