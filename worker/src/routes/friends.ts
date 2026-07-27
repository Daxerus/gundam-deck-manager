import { Hono } from 'hono';
import { inArray } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cards } from '../db/schema';
import { readJson } from '../util/json';
import {
  acceptFriendship,
  areFriends,
  listFriendships,
  rejectOrRemoveFriendship,
  requestFriendship,
  searchUsers,
} from '../services/friends';
import { getCollectionStatus } from '../services/loans';
import { findUserById } from '../services/users';
import { serializeCard } from './cards';

export const friendsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const data = await listFriendships(db, userId);
    return c.json({ data });
  })

  .get('/search', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const q = c.req.query('q') ?? '';
    const data = await searchUsers(db, userId, q);
    return c.json({ data });
  })

  .post('/request', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ userId: number }>(c);
    const toUserId = Math.floor(Number(body.userId));
    if (!Number.isInteger(toUserId) || toUserId < 1) {
      return c.json({ error: 'Invalid userId' }, 400);
    }
    const result = await requestFriendship(db, userId, toUserId);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: result.friendship }, 201);
  })

  .post('/:id/accept', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
    const result = await acceptFriendship(db, userId, id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: result.friendship });
  })

  .delete('/:id', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
    const result = await rejectOrRemoveFriendship(db, userId, id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ ok: true });
  })

  .get('/:id/collection', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const friendUserId = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(friendUserId) || friendUserId < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    const ok = await areFriends(db, userId, friendUserId);
    if (!ok) return c.json({ error: 'Not friends', status: 403 }, 403);

    const friend = await findUserById(db, friendUserId);
    if (!friend) return c.json({ error: 'User not found' }, 404);

    const status = await getCollectionStatus(db, friendUserId);
    const collection: Record<string, number> = {};
    for (const [pid, s] of Object.entries(status)) {
      collection[pid] = s.owned;
    }
    const productIds = Object.keys(status);
    const cardRows = [];
    const CHUNK = 90;
    for (let i = 0; i < productIds.length; i += CHUNK) {
      const chunk = productIds.slice(i, i + CHUNK);
      const rows = await db.select().from(cards).where(inArray(cards.productId, chunk)).all();
      cardRows.push(...rows);
    }
    const cardList = cardRows.map(serializeCard);
    return c.json({
      data: {
        user: { id: friend.id, username: friend.username },
        collection,
        status,
        cards: cardList,
      },
    });
  });
