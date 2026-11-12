import { jsonPatchOperationSchema, type JsonPatchOperation } from './patch';
import { siteConfigSchema, type SiteConfig } from './config';

/*
 * Generic RFC 6902 apply for the merchant's own manual edits (`PATCH /config/draft`).
 * Unlike `validateCommandPatch` (LLM output) there is no path allowlist: the merchant may edit
 * anything the schema allows. Safety comes from validating the whole result with the schema.
 */

export class JsonPatchError extends Error {
  override readonly name = 'JsonPatchError';
  constructor(
    message: string,
    readonly operation: number,
  ) {
    super(message);
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INDEX = /^(0|[1-9]\d*)$/;
export const MAX_JSON_PATCH_OPERATIONS = 100;

type Json = unknown;
type Container = Record<string, Json> | Json[];

function parsePointer(path: string, op: number): string[] {
  if (path === '') return [];
  if (!path.startsWith('/')) throw new JsonPatchError(`Invalid pointer "${path}"`, op);
  return path
    .slice(1)
    .split('/')
    .map((raw) => {
      if (/~[^01]|~$/.test(raw)) throw new JsonPatchError(`Invalid pointer "${path}"`, op);
      const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      if (FORBIDDEN_KEYS.has(seg)) throw new JsonPatchError(`Forbidden key "${seg}"`, op);
      return seg;
    });
}

function isContainer(v: Json): v is Container {
  return typeof v === 'object' && v !== null;
}

function has(container: Container, key: string): boolean {
  if (Array.isArray(container)) return INDEX.test(key) && Number(key) < container.length;
  return Object.prototype.hasOwnProperty.call(container, key);
}

function get(doc: Json, segments: string[], op: number): Json {
  let node = doc;
  for (const seg of segments) {
    if (!isContainer(node) || !has(node, seg)) {
      throw new JsonPatchError(`Path "/${segments.join('/')}" does not exist`, op);
    }
    node = (node as Record<string, Json>)[seg];
  }
  return node;
}

function parentOf(doc: Json, segments: string[], op: number): { parent: Container; key: string } {
  if (segments.length === 0) throw new JsonPatchError('The document root cannot be modified', op);
  const parent = get(doc, segments.slice(0, -1), op);
  if (!isContainer(parent)) throw new JsonPatchError('Parent is not an object or array', op);
  return { parent, key: segments[segments.length - 1] as string };
}

function add(doc: Json, segments: string[], value: Json, op: number): void {
  const { parent, key } = parentOf(doc, segments, op);
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : INDEX.test(key) ? Number(key) : NaN;
    if (!(index >= 0 && index <= parent.length))
      throw new JsonPatchError(`Invalid array index "${key}"`, op);
    parent.splice(index, 0, value);
  } else {
    parent[key] = value;
  }
}

function remove(doc: Json, segments: string[], op: number): Json {
  const { parent, key } = parentOf(doc, segments, op);
  if (!has(parent, key))
    throw new JsonPatchError(`Path "/${segments.join('/')}" does not exist`, op);
  if (Array.isArray(parent)) return parent.splice(Number(key), 1)[0];
  const value = parent[key];
  Reflect.deleteProperty(parent, key);
  return value;
}

function deepEqual(a: Json, b: Json): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Applies RFC 6902 operations to a deep copy of `doc`. Throws `JsonPatchError` on any failure. */
export function applyJsonPatch<T>(doc: T, patch: unknown): T {
  if (!Array.isArray(patch)) throw new JsonPatchError('Patch must be an array', -1);
  if (patch.length > MAX_JSON_PATCH_OPERATIONS) {
    throw new JsonPatchError(
      `A patch may contain at most ${MAX_JSON_PATCH_OPERATIONS} operations`,
      -1,
    );
  }
  const out = structuredClone(doc) as Json;

  patch.forEach((raw, i) => {
    const parsed = jsonPatchOperationSchema.safeParse(raw);
    if (!parsed.success) throw new JsonPatchError('Not a valid JSON Patch operation', i);
    const op: JsonPatchOperation = parsed.data;
    const path = parsePointer(op.path, i);

    switch (op.op) {
      case 'add':
        add(out, path, structuredClone(op.value), i);
        break;
      case 'remove':
        remove(out, path, i);
        break;
      case 'replace': {
        const { parent, key } = parentOf(out, path, i);
        if (!has(parent, key)) throw new JsonPatchError(`Path "${op.path}" does not exist`, i);
        (parent as Record<string, Json>)[key] = structuredClone(op.value);
        break;
      }
      case 'move': {
        const from = parsePointer(op.from, i);
        if (op.path.startsWith(`${op.from}/`))
          throw new JsonPatchError('Cannot move a value into itself', i);
        add(out, path, remove(out, from, i), i);
        break;
      }
      case 'copy':
        add(out, path, structuredClone(get(out, parsePointer(op.from, i), i)), i);
        break;
      case 'test':
        if (!deepEqual(get(out, path, i), op.value))
          throw new JsonPatchError(`Test failed at "${op.path}"`, i);
        break;
    }
  });

  return out as T;
}

export type DraftPatchResult =
  | { ok: true; config: SiteConfig }
  | { ok: false; message: string; issues?: { path: string; message: string }[] };

/** Applies a merchant's manual patch to a draft and validates the result against the schema. */
export function applyDraftPatch(config: SiteConfig, patch: unknown): DraftPatchResult {
  let next: unknown;
  try {
    next = applyJsonPatch(config, patch);
  } catch (error) {
    if (error instanceof JsonPatchError) return { ok: false, message: error.message };
    throw error;
  }
  const parsed = siteConfigSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'The resulting config is invalid',
      issues: parsed.error.issues.map((i) => ({
        path: '/' + i.path.map(String).join('/'),
        message: i.message,
      })),
    };
  }
  return { ok: true, config: parsed.data };
}
