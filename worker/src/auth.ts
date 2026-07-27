import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { jwt } from 'hono/jwt';
import type { MiddlewareHandler } from 'hono';
import type { Env, Vars } from './env';
import { getDb } from './db/client';
import { readJson } from './util/json';
import { timingSafeEqual } from './services/password';
import {
  authenticateUser,
  completeBootstrap,
  createUser,
  findPendingOwner,
  findUserById,
  findUserByUsername,
  needsBootstrap,
  toPublicUser,
  validatePassword,
  validateUsername,
} from './services/users';
import {
  findUnusedInviteCode,
  generateInviteCodes,
  hasUnusedInviteCodes,
  markInviteUsed,
} from './services/invites';

export type AppEnv = { Bindings: Env; Variables: Vars };

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** JWT guard for protected /api routes. Secret comes from env per-request. */
export const authGuard: MiddlewareHandler<AppEnv> = (c, next) => {
  return jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next);
};

/**
 * Resolve authenticated user from JWT payload into context variables.
 * Rejects legacy tokens (`sub: "owner"`) and unknown users.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = c.get('jwtPayload');
  const sub = payload?.sub;
  if (!sub || sub === 'owner') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = Number(sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const db = getDb(c.env);
  const user = await findUserById(db, userId);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('userId', user.id);
  c.set('username', user.username);
  c.set('isAdmin', user.isAdmin);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('isAdmin')) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

async function issueToken(env: Env, user: { id: number; username: string }) {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      sub: String(user.id),
      username: user.username,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    env.JWT_SECRET,
  );
  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

/** Public auth routes. */
export const authRoutes = new Hono<AppEnv>()
  .get('/setup-status', async (c) => {
    const db = getDb(c.env);
    const bootstrapNeeded = await needsBootstrap(db);
    const invitesOpen = await hasUnusedInviteCodes(db);
    return c.json({
      needsBootstrap: bootstrapNeeded,
      registrationOpen: !bootstrapNeeded && invitesOpen,
    });
  })

  .post('/bootstrap', async (c) => {
    try {
      const db = getDb(c.env);
      const pending = await findPendingOwner(db);
      if (!pending) {
        return c.json({ error: 'Already bootstrapped' }, 409);
      }
      const expected = c.env.APP_PASSWORD;
      if (!expected) {
        return c.json({ error: 'Server not configured: APP_PASSWORD missing' }, 500);
      }

      const body = await readJson<{ appPassword: string; username: string; password: string }>(c);
      const appPassword = typeof body.appPassword === 'string' ? body.appPassword.trim() : '';
      if (!appPassword) {
        return c.json({ error: 'Legacy passcode (APP_PASSWORD) required' }, 400);
      }
      // Trim both sides: dashboard/secret uploads often leave trailing newlines.
      if (!timingSafeEqual(appPassword, expected.trim())) {
        return c.json({ error: 'Invalid legacy passcode (APP_PASSWORD)' }, 401);
      }

      const username = validateUsername(body.username);
      if (!username) {
        return c.json(
          { error: 'Invalid username (3-32 chars: a-z, 0-9, underscore)' },
          400,
        );
      }
      const password = validatePassword(body.password);
      if (!password) {
        return c.json({ error: 'New account password must be 8-128 characters' }, 400);
      }

      const taken = await findUserByUsername(db, username);
      if (taken && taken.id !== pending.id) {
        return c.json({ error: 'Username already taken' }, 409);
      }

      const user = await completeBootstrap(db, pending, { username, password });
      // Seed one-shot invites so registration can open without a reusable env secret.
      await generateInviteCodes(db, user.id, 5);
      const session = await issueToken(c.env, user);
      return c.json({ ...session, user: toPublicUser(user) });
    } catch (err) {
      console.error('bootstrap failed', err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Bootstrap failed' },
        500,
      );
    }
  })

  .post('/register', async (c) => {
    const db = getDb(c.env);
    if (await needsBootstrap(db)) {
      return c.json({ error: 'Bootstrap required first' }, 409);
    }

    const body = await readJson<{ username: string; password: string; inviteCode: string }>(c);
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
    if (!inviteCode) {
      return c.json({ error: 'Invalid invite code' }, 401);
    }

    const invite = await findUnusedInviteCode(db, inviteCode);
    if (!invite) {
      return c.json({ error: 'Invalid invite code' }, 401);
    }

    const username = validateUsername(body.username);
    if (!username) {
      return c.json(
        { error: 'Invalid username (3-32 chars: a-z, 0-9, underscore)' },
        400,
      );
    }
    const password = validatePassword(body.password);
    if (!password) {
      return c.json({ error: 'Password must be 8-128 characters' }, 400);
    }

    const existing = await findUserByUsername(db, username);
    if (existing) {
      return c.json({ error: 'Username already taken' }, 409);
    }

    const user = await createUser(db, { username, password, isAdmin: false });
    await markInviteUsed(db, invite.id, user.id);

    const session = await issueToken(c.env, user);
    return c.json({ ...session, user: toPublicUser(user) }, 201);
  })

  .post('/login', async (c) => {
    const db = getDb(c.env);
    if (await needsBootstrap(db)) {
      return c.json({ error: 'Bootstrap required first' }, 409);
    }

    const body = await readJson<{ username: string; password: string }>(c);
    const username = validateUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const user = await authenticateUser(db, username, password);
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const session = await issueToken(c.env, user);
    return c.json({ ...session, user: toPublicUser(user) });
  })

  .get('/me', authGuard, requireUser, async (c) => {
    return c.json({
      user: {
        id: c.get('userId')!,
        username: c.get('username')!,
        isAdmin: c.get('isAdmin')!,
      },
    });
  });
