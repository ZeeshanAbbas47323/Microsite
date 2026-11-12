import { randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7 for primary keys (better InnoDB index locality than v4). */
export function newId(): string {
  return uuidv7();
}

/** URL-safe random token (sessions, CSRF). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
