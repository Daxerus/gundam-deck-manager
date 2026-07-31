import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import {
  allocations,
  collectionItems,
  decks,
  loanItems,
  loans,
  loanTransactions,
  users,
} from '../db/schema';
import {
  buildCardStatusBreakdown,
  groupLoanParties,
  type CardStatusBreakdown,
  type LoanPartyQty,
} from './cardStatus';
import {
  getOwnedByProductId,
  getPrintingsByCardNumber,
  getProductIdToCardNumberMap,
  isDeckComplete,
  loadDeckStates,
} from './deckState';

export type LoanItemInput = { productId: string; quantity: number };
export type DeckImpact = { deckId: number; name: string };

export type TransferResult =
  | {
      ok: true;
      loanId: number;
      transactionId: number;
      deckImpacts: DeckImpact[];
    }
  | { ok: false; error: string; status: 400 | 403 | 404 };

/** Release `qty` physical copies: box first, then active-deck allocations, then any deck. */
export async function releaseCopies(
  db: DB,
  userId: number,
  productId: string,
  qty: number,
): Promise<{ released: number; deckImpacts: DeckImpact[] }> {
  const need = Math.max(0, Math.floor(qty));
  if (need <= 0) return { released: 0, deckImpacts: [] };

  const ownedMap = await getOwnedByProductId(db, userId);
  const owned = ownedMap[productId] ?? 0;
  if (owned < need) {
    return { released: -1, deckImpacts: [] }; // signal insufficient
  }

  const deckRows = await db.select().from(decks).where(eq(decks.userId, userId)).all();
  const deckIds = deckRows.map((d) => d.id);
  const deckById = new Map(deckRows.map((d) => [d.id, d]));

  const allocRows =
    deckIds.length === 0
      ? []
      : await db
          .select()
          .from(allocations)
          .where(and(inArray(allocations.deckId, deckIds), eq(allocations.productId, productId)))
          .all();

  let allocated = 0;
  for (const a of allocRows) allocated += a.quantity;
  // Stale allocations can exceed owned copies; a negative box would inflate the deck pull.
  const box = Math.max(0, owned - allocated);

  let remaining = need;
  const fromBox = Math.min(box, remaining);
  remaining -= fromBox;

  // Prefer active decks, then inactive; stable by deck id.
  const ordered = [...allocRows].sort((a, b) => {
    const da = deckById.get(a.deckId);
    const db_ = deckById.get(b.deckId);
    const aActive = da?.isActive ? 0 : 1;
    const bActive = db_?.isActive ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.deckId - b.deckId;
  });

  const pulls: { deckId: number; qty: number }[] = [];
  for (const a of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(a.quantity, remaining);
    if (take <= 0) continue;
    pulls.push({ deckId: a.deckId, qty: take });
    remaining -= take;
  }

  if (remaining > 0) {
    return { released: -1, deckImpacts: [] };
  }

  const impactedIds = new Set(pulls.map((p) => p.deckId));
  const stmts = [];
  for (const p of pulls) {
    stmts.push(
      db
        .update(allocations)
        .set({ quantity: sql`${allocations.quantity} - ${p.qty}` })
        .where(and(eq(allocations.deckId, p.deckId), eq(allocations.productId, productId))),
    );
  }
  if (pulls.length > 0) {
    stmts.push(db.delete(allocations).where(eq(allocations.quantity, 0)));
  }

  // Reduce collection
  const newQty = owned - need;
  if (newQty <= 0) {
    stmts.push(
      db
        .delete(collectionItems)
        .where(and(eq(collectionItems.userId, userId), eq(collectionItems.productId, productId))),
    );
  } else {
    stmts.push(
      db
        .update(collectionItems)
        .set({ quantity: newQty })
        .where(and(eq(collectionItems.userId, userId), eq(collectionItems.productId, productId))),
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
  }

  // Determine which decks became incomplete after the pull.
  const deckImpacts: DeckImpact[] = [];
  if (impactedIds.size > 0) {
    const states = await loadDeckStates(db, userId);
    const cardNumbers = new Set<string>();
    for (const s of states) {
      if (!impactedIds.has(s.deckId)) continue;
      for (const cn of Object.keys(s.required)) cardNumbers.add(cn);
    }
    const printings = await getPrintingsByCardNumber(db, [...cardNumbers]);
    for (const s of states) {
      if (!impactedIds.has(s.deckId)) continue;
      if (!s.isActive) continue;
      const complete = isDeckComplete(s.required, s.alloc, printings);
      if (!complete) {
        deckImpacts.push({ deckId: s.deckId, name: s.name });
      }
    }
  }

  return { released: need, deckImpacts };
}

async function addToCollection(db: DB, userId: number, productId: string, qty: number): Promise<void> {
  const add = Math.max(0, Math.floor(qty));
  if (add <= 0) return;
  const existing = await db
    .select()
    .from(collectionItems)
    .where(and(eq(collectionItems.userId, userId), eq(collectionItems.productId, productId)))
    .get();
  if (existing) {
    await db
      .update(collectionItems)
      .set({ quantity: existing.quantity + add })
      .where(and(eq(collectionItems.userId, userId), eq(collectionItems.productId, productId)));
  } else {
    await db.insert(collectionItems).values({ userId, productId, quantity: add });
  }
}

async function findOrCreateOpenLoan(
  db: DB,
  lenderId: number,
  borrowerId: number,
): Promise<number> {
  const existing = await db
    .select()
    .from(loans)
    .where(
      and(eq(loans.lenderId, lenderId), eq(loans.borrowerId, borrowerId), eq(loans.status, 'open')),
    )
    .get();
  if (existing) return existing.id;
  const row = await db
    .insert(loans)
    .values({ lenderId, borrowerId, status: 'open' })
    .returning()
    .get();
  return row.id;
}

async function upsertLoanItem(db: DB, loanId: number, productId: string, addQty: number): Promise<void> {
  const existing = await db
    .select()
    .from(loanItems)
    .where(and(eq(loanItems.loanId, loanId), eq(loanItems.productId, productId)))
    .get();
  if (existing) {
    await db
      .update(loanItems)
      .set({ quantity: existing.quantity + addQty })
      .where(eq(loanItems.id, existing.id));
  } else {
    await db.insert(loanItems).values({ loanId, productId, quantity: addQty });
  }
}

export type PrintingAvailability = {
  productId: string;
  /** Copies sitting in the box (not held by any deck). */
  free: number;
  /** Copies currently allocated to a deck. */
  inDecks: number;
};

/**
 * Pick the printings to hand over for a loan requested against `requestedProductId`.
 * Printings of the same card_number are interchangeable everywhere else in the app, so
 * prefer the requested printing, then any printing with box copies, and only take copies
 * out of a deck when nothing is free. Returns null when the lender is short.
 */
export function selectLendPrintings(
  requestedProductId: string,
  quantity: number,
  available: PrintingAvailability[],
): LoanItemInput[] | null {
  const ordered = [...available].sort((a, b) => {
    if (a.productId === b.productId) return 0;
    if (a.productId === requestedProductId) return -1;
    if (b.productId === requestedProductId) return 1;
    return a.productId.localeCompare(b.productId);
  });

  const picked = new Map<string, number>();
  let remaining = quantity;
  for (const source of ['free', 'inDecks'] as const) {
    for (const printing of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(printing[source], remaining);
      if (take <= 0) continue;
      picked.set(printing.productId, (picked.get(printing.productId) ?? 0) + take);
      remaining -= take;
    }
  }
  if (remaining > 0) return null;
  return [...picked.entries()].map(([productId, qty]) => ({ productId, quantity: qty }));
}

/** Map requested printings onto printings the lender actually owns. */
async function resolveLendItems(
  db: DB,
  lenderId: number,
  items: LoanItemInput[],
): Promise<{ ok: true; items: LoanItemInput[] } | { ok: false; error: string }> {
  const owned = await getOwnedByProductId(db, lenderId);
  const requestedIds = [...new Set(items.map((i) => i.productId))];
  const cardNumberByProduct = await getProductIdToCardNumberMap(db, requestedIds);
  const cardNumbers = [...new Set(requestedIds.map((id) => cardNumberByProduct.get(id) ?? id))];
  const printingsByCardNumber = await getPrintingsByCardNumber(db, cardNumbers);

  const deckRows = await db.select().from(decks).where(eq(decks.userId, lenderId)).all();
  const deckIds = deckRows.map((d) => d.id);
  const allocRows =
    deckIds.length === 0
      ? []
      : await db.select().from(allocations).where(inArray(allocations.deckId, deckIds)).all();
  const allocatedByProduct = new Map<string, number>();
  for (const a of allocRows) {
    if (a.quantity <= 0) continue;
    allocatedByProduct.set(a.productId, (allocatedByProduct.get(a.productId) ?? 0) + a.quantity);
  }

  // Requests naming different printings of one card draw from the same pool of copies.
  const needByCardNumber = new Map<string, { requested: string[]; quantity: number }>();
  for (const item of items) {
    const cardNumber = cardNumberByProduct.get(item.productId) ?? item.productId;
    const entry = needByCardNumber.get(cardNumber) ?? { requested: [], quantity: 0 };
    entry.requested.push(item.productId);
    entry.quantity += item.quantity;
    needByCardNumber.set(cardNumber, entry);
  }

  const resolved = new Map<string, number>();
  for (const [cardNumber, need] of needByCardNumber) {
    const printings = new Set(printingsByCardNumber[cardNumber] ?? [cardNumber]);
    for (const productId of need.requested) printings.add(productId);

    const available: PrintingAvailability[] = [...printings].map((productId) => {
      const total = owned[productId] ?? 0;
      const inDecks = Math.min(total, allocatedByProduct.get(productId) ?? 0);
      return { productId, free: total - inDecks, inDecks };
    });

    const picked = selectLendPrintings(need.requested[0]!, need.quantity, available);
    if (!picked) {
      const total = available.reduce((sum, p) => sum + p.free + p.inDecks, 0);
      return {
        ok: false,
        error: `Not enough copies of ${cardNumber} to lend: you own ${total}, need ${need.quantity}`,
      };
    }
    for (const p of picked) {
      resolved.set(p.productId, (resolved.get(p.productId) ?? 0) + p.quantity);
    }
  }

  return {
    ok: true,
    items: [...resolved.entries()].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

/** Transfer copies from lender to borrower and open/update a loan. */
export async function applyLoanTransfer(
  db: DB,
  opts: {
    lenderId: number;
    borrowerId: number;
    items: LoanItemInput[];
  },
): Promise<TransferResult> {
  if (opts.lenderId === opts.borrowerId) {
    return { ok: false, error: 'Cannot lend to yourself', status: 400 };
  }
  const requested = normalizeItems(opts.items);
  if (requested.length === 0) return { ok: false, error: 'No items to lend', status: 400 };

  const resolution = await resolveLendItems(db, opts.lenderId, requested);
  if (!resolution.ok) return { ok: false, error: resolution.error, status: 400 };
  const items = resolution.items;

  const allImpacts: DeckImpact[] = [];
  const impactKeys = new Set<string>();

  for (const item of items) {
    const result = await releaseCopies(db, opts.lenderId, item.productId, item.quantity);
    if (result.released < 0) {
      return {
        ok: false,
        error: `Not enough copies of ${item.productId} to lend`,
        status: 400,
      };
    }
    for (const d of result.deckImpacts) {
      const key = `${d.deckId}`;
      if (!impactKeys.has(key)) {
        impactKeys.add(key);
        allImpacts.push(d);
      }
    }
    await addToCollection(db, opts.borrowerId, item.productId, item.quantity);
  }

  const loanId = await findOrCreateOpenLoan(db, opts.lenderId, opts.borrowerId);
  for (const item of items) {
    await upsertLoanItem(db, loanId, item.productId, item.quantity);
  }

  const now = Math.floor(Date.now() / 1000);
  await db.update(loans).set({ updatedAt: now }).where(eq(loans.id, loanId));

  const tx = await db
    .insert(loanTransactions)
    .values({
      type: 'lend',
      loanId,
      fromUserId: opts.lenderId,
      toUserId: opts.borrowerId,
      itemsJson: JSON.stringify(items),
      deckImpactsJson: JSON.stringify(allImpacts),
    })
    .returning()
    .get();

  return {
    ok: true,
    loanId,
    transactionId: tx.id,
    deckImpacts: allImpacts,
  };
}

/** Return copies from borrower to lender (partial or full). */
export async function applyReturn(
  db: DB,
  opts: {
    loanId: number;
    actorUserId: number;
    items: LoanItemInput[];
  },
): Promise<TransferResult> {
  const loan = await db.select().from(loans).where(eq(loans.id, opts.loanId)).get();
  if (!loan) return { ok: false, error: 'Loan not found', status: 404 };
  if (loan.status !== 'open') return { ok: false, error: 'Loan is closed', status: 400 };
  if (opts.actorUserId !== loan.lenderId && opts.actorUserId !== loan.borrowerId) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }

  const items = normalizeItems(opts.items);
  if (items.length === 0) return { ok: false, error: 'No items to return', status: 400 };

  const openItems = await db.select().from(loanItems).where(eq(loanItems.loanId, loan.id)).all();
  const openByProduct = new Map(openItems.map((r) => [r.productId, r]));

  for (const item of items) {
    const open = openByProduct.get(item.productId);
    if (!open || open.quantity < item.quantity) {
      return {
        ok: false,
        error: `Return exceeds outstanding loan for ${item.productId}`,
        status: 400,
      };
    }
  }

  const allImpacts: DeckImpact[] = [];
  const impactKeys = new Set<string>();

  for (const item of items) {
    const result = await releaseCopies(db, loan.borrowerId, item.productId, item.quantity);
    if (result.released < 0) {
      return {
        ok: false,
        error: `Borrower does not have enough copies of ${item.productId} to return`,
        status: 400,
      };
    }
    for (const d of result.deckImpacts) {
      const key = `${d.deckId}`;
      if (!impactKeys.has(key)) {
        impactKeys.add(key);
        allImpacts.push(d);
      }
    }
    await addToCollection(db, loan.lenderId, item.productId, item.quantity);

    const open = openByProduct.get(item.productId)!;
    const next = open.quantity - item.quantity;
    if (next <= 0) {
      await db.delete(loanItems).where(eq(loanItems.id, open.id));
      openByProduct.delete(item.productId);
    } else {
      await db.update(loanItems).set({ quantity: next }).where(eq(loanItems.id, open.id));
      open.quantity = next;
    }
  }

  const remaining = await db.select().from(loanItems).where(eq(loanItems.loanId, loan.id)).all();
  const now = Math.floor(Date.now() / 1000);
  const stillOpen = remaining.some((r) => r.quantity > 0);
  await db
    .update(loans)
    .set({ status: stillOpen ? 'open' : 'closed', updatedAt: now })
    .where(eq(loans.id, loan.id));

  const tx = await db
    .insert(loanTransactions)
    .values({
      type: 'return',
      loanId: loan.id,
      fromUserId: loan.borrowerId,
      toUserId: loan.lenderId,
      itemsJson: JSON.stringify(items),
      deckImpactsJson: JSON.stringify(allImpacts),
    })
    .returning()
    .get();

  return {
    ok: true,
    loanId: loan.id,
    transactionId: tx.id,
    deckImpacts: allImpacts,
  };
}

function normalizeItems(items: LoanItemInput[]): LoanItemInput[] {
  const map = new Map<string, number>();
  for (const raw of items) {
    const productId = typeof raw.productId === 'string' ? raw.productId.trim() : '';
    const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
    if (!productId || quantity <= 0) continue;
    map.set(productId, (map.get(productId) ?? 0) + quantity);
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Outstanding loans involving a user, for status breakdown. */
async function loadLoanSides(
  db: DB,
  userId: number,
): Promise<{
  lentOutByProduct: Map<string, LoanPartyQty[]>;
  borrowedInByProduct: Map<string, LoanPartyQty[]>;
}> {
  const openLoans = await db
    .select()
    .from(loans)
    .where(
      and(
        eq(loans.status, 'open'),
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId))!,
      ),
    )
    .all();

  const lentOutByProduct = new Map<string, LoanPartyQty[]>();
  const borrowedInByProduct = new Map<string, LoanPartyQty[]>();
  if (openLoans.length === 0) return { lentOutByProduct, borrowedInByProduct };

  const loanIds = openLoans.map((l) => l.id);
  const items = await db.select().from(loanItems).where(inArray(loanItems.loanId, loanIds)).all();
  const otherIds = new Set<number>();
  for (const l of openLoans) {
    otherIds.add(l.lenderId === userId ? l.borrowerId : l.lenderId);
  }
  const otherUsers =
    otherIds.size === 0
      ? []
      : await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, [...otherIds]))
          .all();
  const nameById = new Map(otherUsers.map((u) => [u.id, u.username]));

  const loanById = new Map(openLoans.map((l) => [l.id, l]));
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const loan = loanById.get(item.loanId);
    if (!loan) continue;
    if (loan.lenderId === userId) {
      const list = lentOutByProduct.get(item.productId) ?? [];
      list.push({
        userId: loan.borrowerId,
        username: nameById.get(loan.borrowerId) ?? `user-${loan.borrowerId}`,
        qty: item.quantity,
        loanId: loan.id,
      });
      lentOutByProduct.set(item.productId, list);
    } else {
      const list = borrowedInByProduct.get(item.productId) ?? [];
      list.push({
        userId: loan.lenderId,
        username: nameById.get(loan.lenderId) ?? `user-${loan.lenderId}`,
        qty: item.quantity,
        loanId: loan.id,
      });
      borrowedInByProduct.set(item.productId, list);
    }
  }

  for (const [pid, list] of lentOutByProduct) {
    lentOutByProduct.set(pid, groupLoanParties(list));
  }
  for (const [pid, list] of borrowedInByProduct) {
    borrowedInByProduct.set(pid, groupLoanParties(list));
  }

  return { lentOutByProduct, borrowedInByProduct };
}

/** Full collection status map for a user (possession + loans). */
export async function getCollectionStatus(
  db: DB,
  userId: number,
): Promise<Record<string, CardStatusBreakdown>> {
  const owned = await getOwnedByProductId(db, userId);
  const { lentOutByProduct, borrowedInByProduct } = await loadLoanSides(db, userId);

  // Only assembled (active) decks hold copies away from the box: an inactive deck
  // may keep stale allocations after being cannibalised, but its cards are available.
  const deckRows = await db
    .select()
    .from(decks)
    .where(and(eq(decks.userId, userId), eq(decks.isActive, true)))
    .all();
  const deckName = new Map(deckRows.map((d) => [d.id, d.name] as const));
  const deckIds = deckRows.map((d) => d.id);
  const allocRows =
    deckIds.length === 0
      ? []
      : await db.select().from(allocations).where(inArray(allocations.deckId, deckIds)).all();

  const decksByProduct = new Map<string, { deckId: number; name: string; qty: number }[]>();
  for (const a of allocRows) {
    if (a.quantity <= 0) continue;
    const list = decksByProduct.get(a.productId) ?? [];
    list.push({
      deckId: a.deckId,
      name: deckName.get(a.deckId) ?? `#${a.deckId}`,
      qty: a.quantity,
    });
    decksByProduct.set(a.productId, list);
  }

  const productIds = new Set<string>([
    ...Object.keys(owned),
    ...lentOutByProduct.keys(),
    ...borrowedInByProduct.keys(),
  ]);

  const out: Record<string, CardStatusBreakdown> = {};
  for (const productId of productIds) {
    const qty = owned[productId] ?? 0;
    if (qty <= 0 && !lentOutByProduct.has(productId) && !borrowedInByProduct.has(productId)) {
      continue;
    }
    out[productId] = buildCardStatusBreakdown({
      productId,
      owned: qty,
      deckAlloc: decksByProduct.get(productId) ?? [],
      lentOut: lentOutByProduct.get(productId) ?? [],
      borrowedIn: borrowedInByProduct.get(productId) ?? [],
    });
  }
  return out;
}

export async function listLoanHistory(db: DB, userId: number, limit = 100) {
  const rows = await db
    .select({
      id: loanTransactions.id,
      type: loanTransactions.type,
      loanId: loanTransactions.loanId,
      fromUserId: loanTransactions.fromUserId,
      toUserId: loanTransactions.toUserId,
      itemsJson: loanTransactions.itemsJson,
      deckImpactsJson: loanTransactions.deckImpactsJson,
      createdAt: loanTransactions.createdAt,
      fromUsername: sql<string>`(select username from users where id = ${loanTransactions.fromUserId})`,
      toUsername: sql<string>`(select username from users where id = ${loanTransactions.toUserId})`,
    })
    .from(loanTransactions)
    .where(or(eq(loanTransactions.fromUserId, userId), eq(loanTransactions.toUserId, userId))!)
    .orderBy(desc(loanTransactions.createdAt), desc(loanTransactions.id))
    .limit(Math.max(1, Math.min(250, limit)))
    .all();

  return rows.map((r) => {
    let items: LoanItemInput[] = [];
    let deckImpacts: DeckImpact[] = [];
    try {
      items = JSON.parse(r.itemsJson) as LoanItemInput[];
    } catch {
      items = [];
    }
    try {
      deckImpacts = JSON.parse(r.deckImpactsJson) as DeckImpact[];
    } catch {
      deckImpacts = [];
    }
    const direction =
      r.type === 'lend'
        ? r.fromUserId === userId
          ? 'lent'
          : 'borrowed'
        : r.toUserId === userId
          ? 'received_return'
          : 'returned';
    return {
      id: r.id,
      type: r.type,
      loanId: r.loanId,
      fromUserId: r.fromUserId,
      fromUsername: r.fromUsername,
      toUserId: r.toUserId,
      toUsername: r.toUsername,
      items,
      deckImpacts,
      direction,
      createdAt: r.createdAt,
    };
  });
}

export async function listOpenLoansForUser(db: DB, userId: number) {
  const open = await db
    .select()
    .from(loans)
    .where(
      and(
        eq(loans.status, 'open'),
        or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId))!,
      ),
    )
    .orderBy(desc(loans.updatedAt))
    .all();
  if (open.length === 0) return [];

  const ids = open.map((l) => l.id);
  const items = await db.select().from(loanItems).where(inArray(loanItems.loanId, ids)).all();
  const byLoan = new Map<number, typeof items>();
  for (const it of items) {
    const list = byLoan.get(it.loanId) ?? [];
    list.push(it);
    byLoan.set(it.loanId, list);
  }

  const userIds = new Set<number>();
  for (const l of open) {
    userIds.add(l.lenderId);
    userIds.add(l.borrowerId);
  }
  const names = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, [...userIds]))
    .all();
  const nameById = new Map(names.map((u) => [u.id, u.username]));

  return open.map((l) => ({
    id: l.id,
    lenderId: l.lenderId,
    lenderUsername: nameById.get(l.lenderId) ?? '',
    borrowerId: l.borrowerId,
    borrowerUsername: nameById.get(l.borrowerId) ?? '',
    status: l.status,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    items: (byLoan.get(l.id) ?? [])
      .filter((i) => i.quantity > 0)
      .map((i) => ({ productId: i.productId, quantity: i.quantity })),
  }));
}