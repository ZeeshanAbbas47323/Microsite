import { z } from 'zod';
import { RESERVED_SUBDOMAINS, SUBDOMAIN_MAX_LENGTH, SUBDOMAIN_MIN_LENGTH } from './constants';

export type SubdomainProblem =
  | 'too_short'
  | 'too_long'
  | 'invalid_characters'
  | 'hyphen_at_edge'
  | 'consecutive_hyphens'
  | 'reserved';

export type SubdomainCheck =
  | { ok: true; value: string }
  | { ok: false; value: string; reason: SubdomainProblem; message: string };

const MESSAGES: Record<SubdomainProblem, string> = {
  too_short: `Must be at least ${SUBDOMAIN_MIN_LENGTH} characters`,
  too_long: `Must be at most ${SUBDOMAIN_MAX_LENGTH} characters`,
  invalid_characters: 'Use only lowercase letters, digits and hyphens',
  hyphen_at_edge: 'Cannot start or end with a hyphen',
  consecutive_hyphens: 'Cannot contain two hyphens in a row',
  reserved: 'This name is reserved',
};

const reserved: ReadonlySet<string> = new Set(RESERVED_SUBDOMAINS);

export function normalizeSubdomain(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Format and blocklist rules from FR-1.4. Uniqueness is checked against the `domains` table by the API.
 */
export function checkSubdomain(input: string): SubdomainCheck {
  const value = normalizeSubdomain(input);
  const fail = (reason: SubdomainProblem): SubdomainCheck => ({
    ok: false,
    value,
    reason,
    message: MESSAGES[reason],
  });

  if (value.length < SUBDOMAIN_MIN_LENGTH) return fail('too_short');
  if (value.length > SUBDOMAIN_MAX_LENGTH) return fail('too_long');
  if (!/^[a-z0-9-]+$/.test(value)) return fail('invalid_characters');
  if (value.startsWith('-') || value.endsWith('-')) return fail('hyphen_at_edge');
  if (value.includes('--')) return fail('consecutive_hyphens');
  if (reserved.has(value)) return fail('reserved');
  return { ok: true, value };
}

export const subdomainSchema = z.string().transform((input, ctx) => {
  const result = checkSubdomain(input);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.message, params: { reason: result.reason } });
    return z.NEVER;
  }
  return result.value;
});
