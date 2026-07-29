import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
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
import { listCards } from '../services/cardList';
import { readJson } from '../util/json';

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

  // GET /api/friends/:id/collection/status — status map only (mirrors /collection/status)
  .get('/:id/collection/status', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const friendUserId = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(friendUserId) || friendUserId < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    const ok = await areFriends(db, userId, friendUserId);
    if (!ok) return c.json({ error: 'Not friends' }, 403);

    const friend = await findUserById(db, friendUserId);
    if (!friend) return c.json({ error: 'User not found' }, 404);

    const status = await getCollectionStatus(db, friendUserId);
    return c.json({
      data: {
        user: { id: friend.id, username: friend.username },
        status,
      },
    });
  })

  // GET /api/friends/:id/cards — paginated owned cards (same filters as /api/cards)
  .get('/:id/cards', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const friendUserId = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(friendUserId) || friendUserId < 1) {
      return c.json({ error: 'Invalid id' }, 400);
    }
    const ok = await areFriends(db, userId, friendUserId);
    if (!ok) return c.json({ error: 'Not friends' }, 403);

    const result = await listCards(db, c.req.query(), {
      collectionUserId: friendUserId,
      forceOwnedOnly: true,
    });
    return c.json(result);
  });
