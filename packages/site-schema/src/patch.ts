import { z } from 'zod';
import {
  BORDER_RADII,
  BUTTON_STYLES,
  FOOTER_STYLES,
  NAVBAR_STYLES,
  TEXT_LIMITS,
} from './constants';
import { siteConfigSchema, fontFamilySchema, type SiteConfig } from './config';
import { contrastRatio, WCAG_AA_NORMAL } from './contrast';
import { hexColorSchema, plainText, sanitizePlainText } from './primitives';

/*
 * Command-box patch validation (FR-7.2 to FR-7.6).
 *
 * The model returns RFC 6902 operations. This module is the real enforcement: default deny,
 * only `replace` on allowlisted scalar paths, `move` of sections within one page, and `test`.
 * Each value is checked against its own rule, then the whole resulting config is re-validated.
 * Any failure rejects the entire patch.
 */

export const MAX_PATCH_OPERATIONS = 20;

const pointer = z.string().max(256);

export const jsonPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: pointer, value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: pointer }),
  z.object({ op: z.literal('replace'), path: pointer, value: z.unknown() }),
  z.object({ op: z.literal('move'), from: pointer, path: pointer }),
  z.object({ op: z.literal('copy'), from: pointer, path: pointer }),
  z.object({ op: z.literal('test'), path: pointer, value: z.unknown() }),
]);
export type JsonPatchOperation = z.infer<typeof jsonPatchOperationSchema>;

/** Which optional parts of the allowlist are enabled (lets the API roll out scope gradually). */
export interface CommandScope {
  /** Editing section title/subtitle/ctaLabel text (FR-7.3, P1). */
  sectionText: boolean;
}
export const DEFAULT_COMMAND_SCOPE: CommandScope = { sectionText: true };

export type PatchErrorCode =
  | 'invalid_patch'
  | 'too_many_operations'
  | 'invalid_pointer'
  | 'operation_not_allowed'
  | 'path_not_allowed'
  | 'invalid_value'
  | 'path_not_found'
  | 'invalid_move'
  | 'test_failed'
  | 'invalid_result';

export interface PatchError {
  /** Index of the failing operation, or null for patch-level / result-level errors. */
  operation: number | null;
  code: PatchErrorCode;
  message: string;
  path?: string;
}

export interface PatchWarning {
  code: 'low_contrast';
  message: string;
  paths: [string, string];
  ratio: number;
}

export type PatchValidationResult =
  | { ok: true; patch: JsonPatchOperation[]; config: SiteConfig; warnings: PatchWarning[] }
  | { ok: false; errors: PatchError[] };

// ---------------------------------------------------------------------------------------------
// Allowlist

/** `#` matches an array index segment; anything else must match literally. */
type Pattern = readonly string[];

interface ValueRule {
  pattern: Pattern;
  schema: z.ZodType;
  /** When set, string values are sanitized to plain text of this length before validation. */
  textMaxLength?: number;
  scope?: keyof CommandScope;
  description: string;
}

const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

const VALUE_RULES: readonly ValueRule[] = [
  ...(['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor'] as const).map(
    (key): ValueRule => ({
      pattern: ['theme', key],
      schema: hexColorSchema,
      description: 'hex color',
    }),
  ),
  {
    pattern: ['theme', 'fontFamily'],
    schema: fontFamilySchema,
    description: 'font from the whitelist',
  },
  {
    pattern: ['theme', 'buttonStyle'],
    schema: enumOf(BUTTON_STYLES),
    description: BUTTON_STYLES.join(' | '),
  },
  {
    pattern: ['theme', 'borderRadius'],
    schema: enumOf(BORDER_RADII),
    description: BORDER_RADII.join(' | '),
  },
  {
    pattern: ['navbar', 'style'],
    schema: enumOf(NAVBAR_STYLES),
    description: NAVBAR_STYLES.join(' | '),
  },
  { pattern: ['navbar', 'sticky'], schema: z.boolean(), description: 'boolean' },
  { pattern: ['navbar', 'backgroundColor'], schema: hexColorSchema, description: 'hex color' },
  { pattern: ['navbar', 'textColor'], schema: hexColorSchema, description: 'hex color' },
  { pattern: ['navbar', 'showCart'], schema: z.boolean(), description: 'boolean' },
  {
    pattern: ['footer', 'style'],
    schema: enumOf(FOOTER_STYLES),
    description: FOOTER_STYLES.join(' | '),
  },
  {
    pattern: ['footer', 'text'],
    schema: plainText(TEXT_LIMITS.footerText),
    textMaxLength: TEXT_LIMITS.footerText,
    description: `plain text, max ${TEXT_LIMITS.footerText} chars`,
  },
  {
    pattern: ['pages', '#', 'sections', '#', 'visible'],
    schema: z.boolean(),
    description: 'boolean',
  },
  ...(
    [
      ['title', TEXT_LIMITS.sectionTitle],
      ['subtitle', TEXT_LIMITS.sectionSubtitle],
      ['ctaLabel', TEXT_LIMITS.ctaLabel],
    ] as const
  ).map(([key, max]): ValueRule => ({
    pattern: ['pages', '#', 'sections', '#', 'props', key],
    schema: plainText(max),
    textMaxLength: max,
    scope: 'sectionText',
    description: `plain text, max ${max} chars`,
  })),
];

const SECTION_PATTERN: Pattern = ['pages', '#', 'sections', '#'];

function patternToString(pattern: Pattern, indexNames = ['p', 's']): string {
  let i = 0;
  return '/' + pattern.map((seg) => (seg === '#' ? `{${indexNames[i++] ?? 'i'}}` : seg)).join('/');
}

export interface AllowedCommandPath {
  op: 'replace' | 'move';
  path: string;
  value: string;
}

/** Human/LLM-readable description of the allowlist, for building the system prompt and help text. */
export function describeAllowedPaths(
  scope: CommandScope = DEFAULT_COMMAND_SCOPE,
): AllowedCommandPath[] {
  const rules: AllowedCommandPath[] = VALUE_RULES.filter((r) => !r.scope || scope[r.scope]).map(
    (r) => ({
      op: 'replace',
      path: patternToString(r.pattern),
      value: r.description,
    }),
  );
  rules.push({
    op: 'move',
    path: patternToString(SECTION_PATTERN),
    value: 'from /pages/{p}/sections/{a} to /pages/{p}/sections/{b} (same page only)',
  });
  return rules;
}

// ---------------------------------------------------------------------------------------------
// JSON Pointer helpers (RFC 6901)

const INDEX = /^(0|[1-9]\d{0,3})$/;

function parsePointer(path: string): string[] | null {
  if (path === '' || !path.startsWith('/')) return null;
  const segments: string[] = [];
  for (const raw of path.slice(1).split('/')) {
    if (/~[^01]|~$/.test(raw)) return null;
    segments.push(raw.replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  return segments;
}

function matches(pattern: Pattern, segments: readonly string[]): boolean {
  return (
    pattern.length === segments.length &&
    pattern.every((p, i) => {
      const seg = segments[i] as string;
      return p === '#' ? INDEX.test(seg) : p === seg;
    })
  );
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function hasOwn(container: Container, key: string): boolean {
  if (Array.isArray(container)) return INDEX.test(key) && Number(key) < container.length;
  return Object.prototype.hasOwnProperty.call(container, key);
}

/** Resolves the parent of `segments` in `doc`, requiring every step (and the target) to exist. */
function resolveParent(
  doc: unknown,
  segments: readonly string[],
): { parent: Container; key: string } | null {
  let node: unknown = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as string;
    if (!isContainer(node) || !hasOwn(node, seg)) return null;
    node = (node as Record<string, unknown>)[seg];
  }
  const key = segments[segments.length - 1];
  if (key === undefined || !isContainer(node) || !hasOwn(node, key)) return null;
  return { parent: node, key };
}

// ---------------------------------------------------------------------------------------------
// Validation

const CONTRAST_PAIRS: readonly [string, string][] = [
  ['/theme/textColor', '/theme/backgroundColor'],
  ['/navbar/textColor', '/navbar/backgroundColor'],
];

function readColor(config: SiteConfig, path: string): string {
  const [, group, key] = path.split('/') as [string, 'theme' | 'navbar', string];
  return (config[group] as Record<string, string>)[key] as string;
}

/**
 * Validates a model-proposed patch against the allowlist and the site schema.
 * Never mutates `config`. On success returns the sanitized patch and the resulting config.
 */
export function validateCommandPatch(
  config: SiteConfig,
  rawPatch: unknown,
  scope: CommandScope = DEFAULT_COMMAND_SCOPE,
): PatchValidationResult {
  if (!Array.isArray(rawPatch)) {
    return {
      ok: false,
      errors: [{ operation: null, code: 'invalid_patch', message: 'Patch must be an array' }],
    };
  }
  if (rawPatch.length > MAX_PATCH_OPERATIONS) {
    return {
      ok: false,
      errors: [
        {
          operation: null,
          code: 'too_many_operations',
          message: `A patch may contain at most ${MAX_PATCH_OPERATIONS} operations`,
        },
      ],
    };
  }

  const doc = structuredClone(config) as unknown as Record<string, unknown>;
  const accepted: JsonPatchOperation[] = [];
  const touched = new Set<string>();
  const fail = (
    operation: number,
    code: PatchErrorCode,
    message: string,
    path?: string,
  ): PatchValidationResult => ({
    ok: false,
    errors: [{ operation, code, message, ...(path !== undefined ? { path } : {}) }],
  });

  for (let i = 0; i < rawPatch.length; i++) {
    const parsed = jsonPatchOperationSchema.safeParse(rawPatch[i]);
    if (!parsed.success) return fail(i, 'invalid_patch', 'Not a valid JSON Patch operation');
    const op = parsed.data;

    const segments = parsePointer(op.path);
    if (!segments) return fail(i, 'invalid_pointer', 'Invalid JSON pointer', op.path);

    if (op.op === 'replace' || op.op === 'test') {
      const rule = VALUE_RULES.find((r) => matches(r.pattern, segments));
      if (!rule || (rule.scope && !scope[rule.scope])) {
        return fail(i, 'path_not_allowed', 'This setting cannot be changed by a command', op.path);
      }
      const target = resolveParent(doc, segments);
      if (!target) return fail(i, 'path_not_found', 'Path does not exist in the config', op.path);
      const current = (target.parent as Record<string, unknown>)[target.key];

      if (op.op === 'test') {
        // Every allowlisted path holds a scalar, so strict equality is enough.
        if (current !== op.value) return fail(i, 'test_failed', 'Test operation failed', op.path);
        accepted.push({ op: 'test', path: op.path, value: op.value });
        continue;
      }

      let value = op.value;
      if (rule.textMaxLength !== undefined && typeof value === 'string') {
        value = sanitizePlainText(value, { maxLength: rule.textMaxLength });
      }
      const checked = rule.schema.safeParse(value);
      if (!checked.success) {
        return fail(i, 'invalid_value', `Expected ${rule.description}`, op.path);
      }
      (target.parent as Record<string, unknown>)[target.key] = checked.data;
      touched.add(op.path);
      accepted.push({ op: 'replace', path: op.path, value: checked.data });
      continue;
    }

    if (op.op === 'move') {
      const from = parsePointer(op.from);
      if (!from) return fail(i, 'invalid_pointer', 'Invalid JSON pointer', op.from);
      if (!matches(SECTION_PATTERN, from) || !matches(SECTION_PATTERN, segments)) {
        return fail(i, 'path_not_allowed', 'Only sections can be reordered', op.path);
      }
      if (from[1] !== segments[1]) {
        return fail(
          i,
          'invalid_move',
          'Sections can only be reordered within the same page',
          op.path,
        );
      }
      const pages = doc.pages as SiteConfig['pages'];
      const page = pages[Number(from[1])];
      const fromIndex = Number(from[3]);
      const toIndex = Number(segments[3]);
      if (!page || fromIndex >= page.sections.length) {
        return fail(i, 'path_not_found', 'Section does not exist', op.from);
      }
      // After removing the source, the target index may be at most the last position.
      if (toIndex > page.sections.length - 1) {
        return fail(i, 'invalid_move', 'Target position is out of range', op.path);
      }
      const [section] = page.sections.splice(fromIndex, 1);
      page.sections.splice(toIndex, 0, section as (typeof page.sections)[number]);
      accepted.push({ op: 'move', from: op.from, path: op.path });
      continue;
    }

    return fail(i, 'operation_not_allowed', `"${op.op}" operations are not allowed`, op.path);
  }

  const result = siteConfigSchema.safeParse(doc);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        operation: null,
        code: 'invalid_result' as const,
        message: issue.message,
        path: '/' + issue.path.map(String).join('/'),
      })),
    };
  }

  const warnings: PatchWarning[] = [];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    if (!touched.has(fg) && !touched.has(bg)) continue;
    const ratio = contrastRatio(readColor(result.data, fg), readColor(result.data, bg));
    if (ratio < WCAG_AA_NORMAL) {
      warnings.push({
        code: 'low_contrast',
        message: `Text may be hard to read: contrast ${ratio.toFixed(2)}:1 is below the WCAG AA minimum of ${WCAG_AA_NORMAL}:1`,
        paths: [fg, bg],
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }

  return { ok: true, patch: accepted, config: result.data, warnings };
}
