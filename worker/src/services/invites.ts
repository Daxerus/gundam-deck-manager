import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DB } from '../db/client';
import { inviteCodes } from '../db/schema';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return out; // alphabet is already uppercase
}

export async function countUnusedInviteCodes(db: DB): Promise<number> {
  const rows = await db.select({ id: inviteCodes.id }).from(inviteCodes).where(isNull(inviteCodes.usedBy)).all();
  return rows.length;
}

export async function hasUnusedInviteCodes(db: DB): Promise<boolean> {
  const row = await db.select({ id: inviteCodes.id }).from(inviteCodes).where(isNull(inviteCodes.usedBy)).get();
  return !!row;
}

export async function listInviteCodes(db: DB, limit = 100) {
  const rows = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt), desc(inviteCodes.id))
    .limit(Math.max(1, Math.min(250, limit)))
    .all();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    createdBy: r.createdBy,
    usedBy: r.usedBy,
    usedAt: r.usedAt,
    createdAt: r.createdAt,
    used: r.usedBy != null,
  }));
}

export async function generateInviteCodes(
  db: DB,
  createdBy: number,
  count: number,
): Promise<string[]> {
  const n = Math.max(1, Math.min(50, Math.floor(count) || 1));
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.insert(inviteCodes).values({ code, createdBy });
        codes.push(code);
        break;
      } catch {
        code = randomCode();
      }
    }
  }
  return codes;
}

/**
 * Consume a one-shot invite code. Returns the invite row id on success.
 * Must be called before/around user creation; marks used_by after user exists.
 */
export async function findUnusedInviteCode(db: DB, code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  return db
    .select()
    .from(inviteCodes)
    .where(and(eq(inviteCodes.code, normalized), isNull(inviteCodes.usedBy)))
    .get();
}

export async function markInviteUsed(db: DB, inviteId: number, userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(inviteCodes)
    .set({ usedBy: userId, usedAt: now })
    .where(and(eq(inviteCodes.id, inviteId), isNull(inviteCodes.usedBy)));
}
