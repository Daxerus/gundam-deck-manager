import { and, eq, inArray, like, ne, or } from 'drizzle-orm';
import type { DB } from '../db/client';
import { friendships, users } from '../db/schema';
import { PENDING_OWNER_USERNAME } from './users';

function orderedPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(db: DB, userId: number, otherId: number): Promise<boolean> {
  if (userId === otherId) return false;
  const [userA, userB] = orderedPair(userId, otherId);
  const row = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.userA, userA),
        eq(friendships.userB, userB),
        eq(friendships.status, 'accepted'),
      ),
    )
    .get();
  return !!row;
}

export async function listFriendships(db: DB, userId: number) {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId))!)
    .all();

  const otherIds = rows.map((r) => (r.userA === userId ? r.userB : r.userA));
  const nameRows =
    otherIds.length === 0
      ? []
      : await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, otherIds))
          .all();
  const nameById = new Map(nameRows.map((u) => [u.id, u.username]));

  return rows.map((r) => {
    const otherUserId = r.userA === userId ? r.userB : r.userA;
    return {
      id: r.id,
      status: r.status as 'pending' | 'accepted',
      requestedBy: r.requestedBy,
      otherUserId,
      otherUsername: nameById.get(otherUserId) ?? `user-${otherUserId}`,
      isIncoming: r.status === 'pending' && r.requestedBy !== userId,
      isOutgoing: r.status === 'pending' && r.requestedBy === userId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

export async function searchUsers(db: DB, userId: number, q: string, limit = 20) {
  const query = q.trim().toLowerCase();
  if (query.length < 1) return [];
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        ne(users.username, PENDING_OWNER_USERNAME),
        like(users.username, `%${query}%`),
      ),
    )
    .limit(Math.max(1, Math.min(50, limit)))
    .all();

  const friendshipsList = await listFriendships(db, userId);
  const byOther = new Map(friendshipsList.map((f) => [f.otherUserId, f]));

  return rows.map((u) => {
    const f = byOther.get(u.id);
    return {
      id: u.id,
      username: u.username,
      friendshipStatus: f?.status ?? null,
      friendshipId: f?.id ?? null,
    };
  });
}

export type FriendActionResult =
  | { ok: true; friendship: Awaited<ReturnType<typeof listFriendships>>[number] }
  | { ok: false; error: string; status: 400 | 403 | 404 | 409 };

export async function requestFriendship(
  db: DB,
  fromUserId: number,
  toUserId: number,
): Promise<FriendActionResult> {
  if (fromUserId === toUserId) {
    return { ok: false, error: 'Cannot friend yourself', status: 400 };
  }
  const other = await db.select().from(users).where(eq(users.id, toUserId)).get();
  if (!other || other.username === PENDING_OWNER_USERNAME) {
    return { ok: false, error: 'User not found', status: 404 };
  }

  const [userA, userB] = orderedPair(fromUserId, toUserId);
  const existing = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)))
    .get();

  if (existing) {
    if (existing.status === 'accepted') {
      return { ok: false, error: 'Already friends', status: 409 };
    }
    return { ok: false, error: 'Request already pending', status: 409 };
  }

  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .insert(friendships)
    .values({
      userA,
      userB,
      status: 'pending',
      requestedBy: fromUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const list = await listFriendships(db, fromUserId);
  const friendship = list.find((f) => f.id === row.id);
  if (!friendship) return { ok: false, error: 'Failed to create request', status: 400 };
  return { ok: true, friendship };
}

export async function acceptFriendship(
  db: DB,
  userId: number,
  friendshipId: number,
): Promise<FriendActionResult> {
  const row = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).get();
  if (!row) return { ok: false, error: 'Request not found', status: 404 };
  if (row.userA !== userId && row.userB !== userId) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }
  if (row.status !== 'pending') {
    return { ok: false, error: 'Request is not pending', status: 400 };
  }
  if (row.requestedBy === userId) {
    return { ok: false, error: 'Cannot accept your own request', status: 400 };
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(friendships)
    .set({ status: 'accepted', updatedAt: now })
    .where(eq(friendships.id, friendshipId));

  const list = await listFriendships(db, userId);
  const friendship = list.find((f) => f.id === friendshipId);
  if (!friendship) return { ok: false, error: 'Failed to accept', status: 400 };
  return { ok: true, friendship };
}

export async function rejectOrRemoveFriendship(
  db: DB,
  userId: number,
  friendshipId: number,
): Promise<{ ok: true } | { ok: false; error: string; status: 403 | 404 }> {
  const row = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).get();
  if (!row) return { ok: false, error: 'Not found', status: 404 };
  if (row.userA !== userId && row.userB !== userId) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }
  await db.delete(friendships).where(eq(friendships.id, friendshipId));
  return { ok: true };
}
