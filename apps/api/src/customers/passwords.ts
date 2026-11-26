import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 64;
const PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, params: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, params, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** `scrypt$N$r$p$salt$hash` (base64url), so parameters can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Used when no account matches, so a failed sign-in takes about as long either way. */
export const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
