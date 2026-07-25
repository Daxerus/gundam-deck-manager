import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { users, type UserRow } from '../db/schema';
import { hashPassword, isPendingPasswordHash, verifyPassword } from './password';

export const PENDING_OWNER_USERNAME = '__pending_owner__';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 128;

export type PublicUser = {
  id: number;
  username: string;
  isAdmin: boolean;
};

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, username: row.username, isAdmin: row.isAdmin };
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) return null;
  if (username === PENDING_OWNER_USERNAME) return null;
  if (username.startsWith('__')) return null;
  return username;
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length < MIN_PASSWORD_LEN || raw.length > MAX_PASSWORD_LEN) return null;
  return raw;
}

export async function findUserByUsername(db: DB, username: string): Promise<UserRow | undefined> {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export async function findUserById(db: DB, id: number): Promise<UserRow | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function findPendingOwner(db: DB): Promise<UserRow | undefined> {
  const row = await db.select().from(users).where(eq(users.username, PENDING_OWNER_USERNAME)).get();
  if (!row || !isPendingPasswordHash(row.passwordHash)) return undefined;
  return row;
}

export async function needsBootstrap(db: DB): Promise<boolean> {
  return !!(await findPendingOwner(db));
}

export async function createUser(
  db: DB,
  opts: { username: string; password: string; isAdmin?: boolean },
): Promise<UserRow> {
  const passwordHash = await hashPassword(opts.password);
  return db
    .insert(users)
    .values({
      username: opts.username,
      passwordHash,
      isAdmin: opts.isAdmin ?? false,
    })
    .returning()
    .get();
}

export async function completeBootstrap(
  db: DB,
  pending: UserRow,
  opts: { username: string; password: string },
): Promise<UserRow> {
  const passwordHash = await hashPassword(opts.password);
  const row = await db
    .update(users)
    .set({
      username: opts.username,
      passwordHash,
      isAdmin: true,
    })
    .where(eq(users.id, pending.id))
    .returning()
    .get();
  return row!;
}

export async function authenticateUser(
  db: DB,
  username: string,
  password: string,
): Promise<UserRow | null> {
  const row = await findUserByUsername(db, username);
  if (!row || isPendingPasswordHash(row.passwordHash)) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? row : null;
}
