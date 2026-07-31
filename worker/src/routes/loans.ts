import { Hono } from 'hono';
import { and, eq, or } from 'drizzle-orm';
import type { AppEnv } from '../auth';
import { getDb } from '../db/client';
import { cardRequests, returnRequests } from '../db/schema';
import { readJson } from '../util/json';
import { areFriends } from '../services/friends';
import {
  deleteLoanContact,
  findOrCreateLoanContact,
  listLoanContacts,
  toPublicContact,
} from '../services/loanContacts';
import {
  applyExternalLoanTransfer,
  applyLoanTransfer,
  applyReturn,
  listLoanHistory,
  listOpenLoansForUser,
  type ExternalLoanDirection,
  type LoanItemInput,
} from '../services/loans';
import { findUserById } from '../services/users';

function parseItems(raw: unknown): LoanItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  const items: LoanItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const productId = String((row as { productId?: unknown }).productId ?? '').trim();
    const quantity = Math.floor(Number((row as { quantity?: unknown }).quantity) || 0);
    if (!productId || quantity <= 0) continue;
    items.push({ productId, quantity });
  }
  return items;
}

export const loansRoutes = new Hono<AppEnv>()
  .get('/open', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const data = await listOpenLoansForUser(db, userId);
    return c.json({ data });
  })

  .get('/history', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const limit = Number(c.req.query('limit') || 100);
    const data = await listLoanHistory(db, userId, limit);
    return c.json({ data });
  })

  .post('/', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ borrowerId: number; items: LoanItemInput[] }>(c);
    const borrowerId = Math.floor(Number(body.borrowerId));
    if (!Number.isInteger(borrowerId) || borrowerId < 1) {
      return c.json({ error: 'Invalid borrowerId' }, 400);
    }
    const items = parseItems(body.items);
    if (!items || items.length === 0) return c.json({ error: 'Invalid items' }, 400);

    const friends = await areFriends(db, userId, borrowerId);
    if (!friends) return c.json({ error: 'Must be friends to lend' }, 403);

    const result = await applyLoanTransfer(db, {
      lenderId: userId,
      borrowerId,
      items,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: result }, 201);
  })

  // --- External (unregistered) contacts — before /:id routes ---
  .get('/contacts', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const data = await listLoanContacts(db, userId);
    return c.json({ data });
  })

  .post('/contacts', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ nick: string }>(c);
    const result = await findOrCreateLoanContact(db, userId, body.nick);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: toPublicContact(result.contact) }, 201);
  })

  .delete('/contacts/:id', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
    const result = await deleteLoanContact(db, userId, id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ ok: true });
  })

  .post('/external', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{
      contactId?: number;
      nick?: string;
      direction: ExternalLoanDirection;
      items: LoanItemInput[];
    }>(c);
    const direction = body.direction;
    if (direction !== 'lent' && direction !== 'borrowed') {
      return c.json({ error: 'Invalid direction' }, 400);
    }
    const contactId = body.contactId != null ? Math.floor(Number(body.contactId)) : undefined;
    if (contactId != null && (!Number.isInteger(contactId) || contactId < 1)) {
      return c.json({ error: 'Invalid contactId' }, 400);
    }
    const items = parseItems(body.items);
    if (!items || items.length === 0) return c.json({ error: 'Invalid items' }, 400);
    if (contactId == null && !String(body.nick ?? '').trim()) {
      return c.json({ error: 'contactId or nick required' }, 400);
    }

    const result = await applyExternalLoanTransfer(db, {
      ownerUserId: userId,
      contactId,
      nick: body.nick,
      direction,
      items,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: result }, 201);
  })

  // --- Card requests (ask a friend for cards) — before /:id routes ---
  .get('/requests', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const rows = await db
      .select()
      .from(cardRequests)
      .where(
        and(
          eq(cardRequests.status, 'pending'),
          or(eq(cardRequests.fromUserId, userId), eq(cardRequests.toUserId, userId))!,
        ),
      )
      .all();
    const mine = rows;
    const userIds = [...new Set(mine.flatMap((r) => [r.fromUserId, r.toUserId]))];
    const names = await Promise.all(userIds.map((id) => findUserById(db, id)));
    const nameById = new Map(names.filter(Boolean).map((u) => [u!.id, u!.username]));
    return c.json({
      data: mine.map((r) => ({
        id: r.id,
        fromUserId: r.fromUserId,
        fromUsername: nameById.get(r.fromUserId) ?? '',
        toUserId: r.toUserId,
        toUsername: nameById.get(r.toUserId) ?? '',
        productId: r.productId,
        quantity: r.quantity,
        status: r.status,
        createdAt: r.createdAt,
        direction: r.toUserId === userId ? 'incoming' : 'outgoing',
      })),
    });
  })

  .post('/requests', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ toUserId: number; productId: string; quantity: number }>(c);
    const toUserId = Math.floor(Number(body.toUserId));
    const productId = String(body.productId ?? '').trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    if (!Number.isInteger(toUserId) || toUserId < 1 || !productId) {
      return c.json({ error: 'Invalid request' }, 400);
    }
    if (!(await areFriends(db, userId, toUserId))) {
      return c.json({ error: 'Must be friends to request cards' }, 403);
    }
    const now = Math.floor(Date.now() / 1000);
    const row = await db
      .insert(cardRequests)
      .values({
        fromUserId: userId,
        toUserId,
        productId,
        quantity,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json({ data: row }, 201);
  })

  .post('/requests/:id/accept', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    const req = await db.select().from(cardRequests).where(eq(cardRequests.id, id)).get();
    if (!req) return c.json({ error: 'Request not found' }, 404);
    if (req.toUserId !== userId) return c.json({ error: 'Forbidden' }, 403);
    if (req.status !== 'pending') return c.json({ error: 'Request is not pending' }, 400);

    const result = await applyLoanTransfer(db, {
      lenderId: userId,
      borrowerId: req.fromUserId,
      items: [{ productId: req.productId, quantity: req.quantity }],
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);

    const now = Math.floor(Date.now() / 1000);
    await db
      .update(cardRequests)
      .set({ status: 'accepted', updatedAt: now })
      .where(eq(cardRequests.id, id));

    return c.json({ data: result });
  })

  .post('/requests/:id/reject', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    const req = await db.select().from(cardRequests).where(eq(cardRequests.id, id)).get();
    if (!req) return c.json({ error: 'Request not found' }, 404);
    if (req.toUserId !== userId && req.fromUserId !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    if (req.status !== 'pending') return c.json({ error: 'Request is not pending' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const status = req.fromUserId === userId ? 'cancelled' : 'rejected';
    await db.update(cardRequests).set({ status, updatedAt: now }).where(eq(cardRequests.id, id));
    return c.json({ ok: true });
  })

  .post('/:id/returns', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const loanId = Math.floor(Number(c.req.param('id')));
    if (!Number.isInteger(loanId) || loanId < 1) return c.json({ error: 'Invalid id' }, 400);
    const body = await readJson<{ items: LoanItemInput[] }>(c);
    const items = parseItems(body.items);
    if (!items || items.length === 0) return c.json({ error: 'Invalid items' }, 400);

    const result = await applyReturn(db, { loanId, actorUserId: userId, items });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ data: result });
  })

  // --- Return requests ---
  .get('/return-requests', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const openLoans = await listOpenLoansForUser(db, userId);
    const loanIds = openLoans.map((l) => l.id);
    if (loanIds.length === 0) return c.json({ data: [] });

    const rows = await db.select().from(returnRequests).all();
    const mine = rows.filter(
      (r) => r.status === 'pending' && loanIds.includes(r.loanId),
    );
    return c.json({
      data: mine.map((r) => ({
        id: r.id,
        loanId: r.loanId,
        requestedBy: r.requestedBy,
        productId: r.productId,
        quantity: r.quantity,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  })

  .post('/return-requests', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const body = await readJson<{ loanId: number; productId: string; quantity: number }>(c);
    const loanId = Math.floor(Number(body.loanId));
    const productId = String(body.productId ?? '').trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    if (!Number.isInteger(loanId) || loanId < 1 || !productId) {
      return c.json({ error: 'Invalid request' }, 400);
    }
    const open = await listOpenLoansForUser(db, userId);
    const loan = open.find((l) => l.id === loanId);
    if (!loan) return c.json({ error: 'Loan not found' }, 404);

    const now = Math.floor(Date.now() / 1000);
    const row = await db
      .insert(returnRequests)
      .values({
        loanId,
        requestedBy: userId,
        productId,
        quantity,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json({ data: row }, 201);
  })

  .post('/return-requests/:id/accept', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    const req = await db.select().from(returnRequests).where(eq(returnRequests.id, id)).get();
    if (!req) return c.json({ error: 'Not found' }, 404);
    if (req.status !== 'pending') return c.json({ error: 'Not pending' }, 400);

    const open = await listOpenLoansForUser(db, userId);
    const loan = open.find((l) => l.id === req.loanId);
    if (!loan) return c.json({ error: 'Loan not found' }, 404);
    // Either party can confirm a return request.
    if (loan.lenderId !== userId && loan.borrowerId !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const result = await applyReturn(db, {
      loanId: req.loanId,
      actorUserId: userId,
      items: [{ productId: req.productId, quantity: req.quantity }],
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);

    const now = Math.floor(Date.now() / 1000);
    await db
      .update(returnRequests)
      .set({ status: 'accepted', updatedAt: now })
      .where(eq(returnRequests.id, id));

    return c.json({ data: result });
  })

  .post('/return-requests/:id/reject', async (c) => {
    const db = getDb(c.env);
    const userId = c.get('userId')!;
    const id = Math.floor(Number(c.req.param('id')));
    const req = await db.select().from(returnRequests).where(eq(returnRequests.id, id)).get();
    if (!req) return c.json({ error: 'Not found' }, 404);
    if (req.status !== 'pending') return c.json({ error: 'Not pending' }, 400);

    const open = await listOpenLoansForUser(db, userId);
    const loan = open.find((l) => l.id === req.loanId);
    if (!loan || (loan.lenderId !== userId && loan.borrowerId !== userId)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const now = Math.floor(Date.now() / 1000);
    await db
      .update(returnRequests)
      .set({ status: 'rejected', updatedAt: now })
      .where(eq(returnRequests.id, id));
    return c.json({ ok: true });
  });
