import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  isPendingPasswordHash,
  timingSafeEqual,
  verifyPassword,
} from './password';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const stored = await hashPassword('correct-horse-battery');
    expect(stored.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('correct-horse-battery', stored)).toBe(true);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('rejects pending marker and malformed hashes', async () => {
    expect(isPendingPasswordHash('!pending')).toBe(true);
    expect(await verifyPassword('anything', '!pending')).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'pbkdf2$bad$salt$hash')).toBe(false);
  });

  it('uses different salts for the same password', async () => {
    const a = await hashPassword('same-password-12');
    const b = await hashPassword('same-password-12');
    expect(a).not.toEqual(b);
    expect(await verifyPassword('same-password-12', a)).toBe(true);
    expect(await verifyPassword('same-password-12', b)).toBe(true);
  });
});

describe('timingSafeEqual', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});
