import { and, asc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { loanContacts, loans, type LoanContactRow } from '../db/schema';

const MAX_NICK_LEN = 40;

export type LoanContactPublic = {
  id: number;
  nick: string;
  createdAt: number;
  updatedAt: number;
};

export function normalizeNick(raw: unknown): { ok: true; nick: string; nickKey: string } | { ok: false; error: string } {
  const nick = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!nick) return { ok: false, error: 'Nick is required' };
  if (nick.length > MAX_NICK_LEN) {
    return { ok: false, error: `Nick must be at most ${MAX_NICK_LEN} characters` };
  }
  return { ok: true, nick, nickKey: nick.toLowerCase() };
}

export function toPublicContact(row: LoanContactRow): LoanContactPublic {
  return {
    id: row.id,
    nick: row.nick,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listLoanContacts(db: DB, ownerUserId: number): Promise<LoanContactPublic[]> {
  const rows = await db
    .select()
    .from(loanContacts)
    .where(eq(loanContacts.ownerUserId, ownerUserId))
    .orderBy(asc(loanContacts.nickKey))
    .all();
  return rows.map(toPublicContact);
}

export async function findLoanContactById(
  db: DB,
  ownerUserId: number,
  contactId: number,
): Promise<LoanContactRow | null> {
  const row = await db
    .select()
    .from(loanContacts)
    .where(and(eq(loanContacts.id, contactId), eq(loanContacts.ownerUserId, ownerUserId)))
    .get();
  return row ?? null;
}

/** Create or return an existing contact for this owner (case-insensitive nick). */
export async function findOrCreateLoanContact(
  db: DB,
  ownerUserId: number,
  rawNick: unknown,
): Promise<{ ok: true; contact: LoanContactRow } | { ok: false; error: string; status: 400 }> {
  const normalized = normalizeNick(rawNick);
  if (!normalized.ok) return { ok: false, error: normalized.error, status: 400 };

  const existing = await db
    .select()
    .from(loanContacts)
    .where(
      and(eq(loanContacts.ownerUserId, ownerUserId), eq(loanContacts.nickKey, normalized.nickKey)),
    )
    .get();
  if (existing) return { ok: true, contact: existing };

  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .insert(loanContacts)
    .values({
      ownerUserId,
      nick: normalized.nick,
      nickKey: normalized.nickKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return { ok: true, contact: row };
}

export async function deleteLoanContact(
  db: DB,
  ownerUserId: number,
  contactId: number,
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 403 | 404 }> {
  const row = await findLoanContactById(db, ownerUserId, contactId);
  if (!row) return { ok: false, error: 'Contact not found', status: 404 };
  const open = await db
    .select({ id: loans.id })
    .from(loans)
    .where(and(eq(loans.contactId, contactId), eq(loans.status, 'open')))
    .get();
  if (open) {
    return {
      ok: false,
      error: 'Cannot delete a contact with open loans',
      status: 400,
    };
  }
  await db.delete(loanContacts).where(eq(loanContacts.id, contactId));
  return { ok: true };
}
