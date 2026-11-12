import { z } from 'zod';

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// A "<" immediately followed by what HTML parsers treat as a tag start: <b>, </p>, <!-- -->, <?php
const TAG_LIKE = /<[a-zA-Z!/?]/;
const TAG_LIKE_GLOBAL = /<[a-zA-Z!/?][^>]*>?/g;
// C0/C1 control characters except tab, LF and CR.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// eslint-disable-next-line no-control-regex
const HAS_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

export function containsHtml(value: string): boolean {
  return TAG_LIKE.test(value);
}

export interface SanitizeOptions {
  maxLength: number;
  multiline?: boolean;
}

/**
 * Turns arbitrary input into safe plain text: strips tag-like markup and control characters,
 * collapses whitespace (keeping single newlines when `multiline`) and truncates.
 * Used on command-box output and form input before schema validation.
 */
export function sanitizePlainText(
  value: string,
  { maxLength, multiline = false }: SanitizeOptions,
): string {
  let out = value.replace(TAG_LIKE_GLOBAL, '').replace(CONTROL_CHARS, '');
  if (multiline) {
    out = out
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    out = out.replace(/\s+/g, ' ');
  }
  out = out.trim();
  return Array.from(out).slice(0, maxLength).join('').trim();
}

/** Plain text: no markup, no control characters, length counted in code points. */
export function plainText(maxLength: number, { multiline = false, min = 0 } = {}) {
  return z
    .string()
    .trim()
    .refine((v) => Array.from(v).length >= min, { error: `Must be at least ${min} characters` })
    .refine((v) => Array.from(v).length <= maxLength, {
      error: `Must be at most ${maxLength} characters`,
    })
    .refine((v) => !containsHtml(v), { error: 'HTML is not allowed' })
    .refine((v) => !HAS_CONTROL_CHARS.test(v), { error: 'Control characters are not allowed' })
    .refine((v) => multiline || !/[\r\n]/.test(v), { error: 'Line breaks are not allowed' });
}

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, { error: 'Must be a hex color like #1a73e8' });

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Same-site relative path such as `/products?sort=new` or `/about#team`. Never protocol-relative. */
function isRelativePath(value: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(value);
}

/** http(s) absolute URL or a same-site relative path. Nothing else (no javascript:, data:, //host). */
export function isSafeLink(value: string): boolean {
  return isRelativePath(value) || isHttpUrl(value);
}

export const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeLink, { error: 'Must be an http(s) URL or a path starting with /' });

/** Images: https (or a site-relative path for bundled placeholders). Plain http is refused. */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => isRelativePath(v) || (isHttpUrl(v) && v.startsWith('https:')), {
    error: 'Must be an https URL or a path starting with /',
  });

/** Allows the empty string, which the config uses for "not set". */
export function optionalString<T extends z.ZodType<string, string>>(schema: T) {
  return z.union([z.literal(''), schema]);
}

const PK_MOBILE_LOCAL = /^03\d{9}$/;
const PK_MOBILE_INTL = /^\+923\d{9}$/;

function compactPhone(value: string): string {
  return value.trim().replace(/[\s-]/g, '');
}

/** Accepts `03XXXXXXXXX` and `+923XXXXXXXXX`, ignoring spaces and dashes (FR-1.3). */
export function isValidPkPhone(value: string): boolean {
  const v = compactPhone(value);
  return PK_MOBILE_LOCAL.test(v) || PK_MOBILE_INTL.test(v);
}

/** Normalizes a valid Pakistani mobile number to `+923XXXXXXXXX`. Returns null when invalid. */
export function normalizePkPhone(value: string): string | null {
  const v = compactPhone(value);
  if (PK_MOBILE_INTL.test(v)) return v;
  if (PK_MOBILE_LOCAL.test(v)) return `+92${v.slice(1)}`;
  return null;
}

/** Validates and stores the normalized `+923XXXXXXXXX` form. */
export const pkPhoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizePkPhone(value);
  if (normalized === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be a Pakistani mobile number (03XXXXXXXXX or +923XXXXXXXXX)',
    });
    return z.NEVER;
  }
  return normalized;
});

export const emailSchema = z.email({ error: 'Must be a valid email address' }).max(254);

function socialUrl(hosts: readonly string[]) {
  return z
    .string()
    .trim()
    .max(2048)
    .refine(
      (v) => {
        if (!isHttpUrl(v) || !v.startsWith('https:')) return false;
        const host = new URL(v).hostname.toLowerCase();
        return hosts.some((h) => host === h || host.endsWith(`.${h}`));
      },
      { error: `Must be an https link on ${hosts.join(' or ')}` },
    );
}

export const facebookUrlSchema = socialUrl(['facebook.com', 'fb.com']);
export const instagramUrlSchema = socialUrl(['instagram.com']);
export const tiktokUrlSchema = socialUrl(['tiktok.com']);

/** Section ids are referenced by the editor; keep them short and URL-safe. */
export const sectionIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,40}$/, { error: 'Invalid section id' });

export const pageSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'Slug may only contain lowercase letters, digits and single hyphens',
  })
  .max(40);
