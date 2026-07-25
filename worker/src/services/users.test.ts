import { describe, expect, it } from 'vitest';
import { normalizeUsername, PENDING_OWNER_USERNAME, validatePassword, validateUsername } from './users';

describe('username validation', () => {
  it('normalizes and accepts valid usernames', () => {
    expect(normalizeUsername('  Alex_01 ')).toBe('alex_01');
    expect(validateUsername('Alex_01')).toBe('alex_01');
    expect(validateUsername('abc')).toBe('abc');
    expect(validateUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('rejects invalid usernames', () => {
    expect(validateUsername('ab')).toBeNull();
    expect(validateUsername('a'.repeat(33))).toBeNull();
    expect(validateUsername('Bad Name')).toBeNull();
    expect(validateUsername('bad-name')).toBeNull();
    expect(validateUsername('bad.name')).toBeNull();
    expect(validateUsername(PENDING_OWNER_USERNAME)).toBeNull();
    expect(validateUsername('__system')).toBeNull();
    expect(validateUsername(123)).toBeNull();
  });
});

describe('password validation', () => {
  it('accepts passwords in the allowed length range', () => {
    expect(validatePassword('12345678')).toBe('12345678');
    expect(validatePassword('x'.repeat(128))).toBe('x'.repeat(128));
  });

  it('rejects short, long, or non-string passwords', () => {
    expect(validatePassword('short')).toBeNull();
    expect(validatePassword('x'.repeat(129))).toBeNull();
    expect(validatePassword(null)).toBeNull();
  });
});
