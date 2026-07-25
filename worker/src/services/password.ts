/**
 * Password hashing via Web Crypto PBKDF2-SHA256.
 * Stored format: `pbkdf2$<iterations>$<saltB64>$<hashB64>`
 */

const ALGORITHM = 'PBKDF2';
const HASH = 'SHA-256';
const ITERATIONS = 210_000;
const KEY_LENGTH = 32; // 256-bit
const SALT_LENGTH = 16;
const PENDING_MARKER = '!pending';

export function isPendingPasswordHash(stored: string): boolean {
  return stored === PENDING_MARKER;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || isPendingPasswordHash(stored)) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return timingSafeEqualBytes(actual, expected);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), ALGORITHM, false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH, salt, iterations },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time comparison for equal-length byte arrays. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    let diff = 1;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      diff |= (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
    }
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Constant-time string comparison to avoid leaking length/content via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return timingSafeEqualBytes(enc.encode(a), enc.encode(b));
}
