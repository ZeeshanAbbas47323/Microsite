import { describe, expect, it } from 'vitest';
import { applyDraftPatch, applyJsonPatch, JsonPatchError, MAX_JSON_PATCH_OPERATIONS } from '../src';
import { sampleConfig } from './fixtures';

const doc = { a: 1, list: ['x', 'y'], nested: { b: true } };

describe('applyJsonPatch (RFC 6902)', () => {
  it('adds, replaces and removes', () => {
    const out = applyJsonPatch(doc, [
      { op: 'add', path: '/c', value: 3 },
      { op: 'add', path: '/list/1', value: 'mid' },
      { op: 'add', path: '/list/-', value: 'end' },
      { op: 'replace', path: '/a', value: 2 },
      { op: 'remove', path: '/nested/b' },
    ]);
    expect(out).toEqual({ a: 2, c: 3, list: ['x', 'mid', 'y', 'end'], nested: {} });
    expect(doc).toEqual({ a: 1, list: ['x', 'y'], nested: { b: true } });
  });

  it('moves, copies and tests', () => {
    const out = applyJsonPatch(doc, [
      { op: 'test', path: '/nested/b', value: true },
      { op: 'copy', from: '/list/0', path: '/first' },
      { op: 'move', from: '/list/0', path: '/list/1' },
    ]);
    expect(out).toEqual({ a: 1, first: 'x', list: ['y', 'x'], nested: { b: true } });
  });

  it.each([
    ['not an array', {}],
    [
      'too many ops',
      Array.from({ length: MAX_JSON_PATCH_OPERATIONS + 1 }, () => ({
        op: 'test',
        path: '/a',
        value: 1,
      })),
    ],
    ['bad op', [{ op: 'nope', path: '/a' }]],
    ['bad pointer', [{ op: 'replace', path: 'a', value: 1 }]],
    ['bad escape', [{ op: 'replace', path: '/a~', value: 1 }]],
    ['__proto__', [{ op: 'add', path: '/__proto__/x', value: 1 }]],
    ['constructor', [{ op: 'add', path: '/nested/constructor', value: 1 }]],
    ['replace root', [{ op: 'replace', path: '', value: {} }]],
    ['replace missing', [{ op: 'replace', path: '/zzz', value: 1 }]],
    ['remove missing', [{ op: 'remove', path: '/zzz' }]],
    ['add into missing parent', [{ op: 'add', path: '/x/y', value: 1 }]],
    ['add into scalar', [{ op: 'add', path: '/a/b', value: 1 }]],
    ['bad array index', [{ op: 'add', path: '/list/9', value: 1 }]],
    ['non-numeric array index', [{ op: 'add', path: '/list/x', value: 1 }]],
    ['move into itself', [{ op: 'move', from: '/nested', path: '/nested/inner' }]],
    ['failed test', [{ op: 'test', path: '/a', value: 2 }]],
  ])('rejects %s', (_name, patch) => {
    expect(() => applyJsonPatch(doc, patch)).toThrow(JsonPatchError);
  });

  it('does not pollute prototypes', () => {
    try {
      applyJsonPatch({}, [{ op: 'add', path: '/__proto__/polluted', value: true }]);
    } catch {
      // expected
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('applyDraftPatch', () => {
  it('applies a valid manual edit', () => {
    const r = applyDraftPatch(sampleConfig(), [
      { op: 'replace', path: '/business/tagline', value: 'New tagline' },
      { op: 'remove', path: '/pages/0/sections/2' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.business.tagline).toBe('New tagline');
      expect(r.config.pages[0]?.sections).toHaveLength(3);
    }
  });

  it('rejects results that break the schema', () => {
    const r = applyDraftPatch(sampleConfig(), [
      { op: 'add', path: '/theme/customCss', value: 'x' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues?.length).toBeGreaterThan(0);
    const html = applyDraftPatch(sampleConfig(), [
      { op: 'replace', path: '/business/name', value: '<b>x</b>' },
    ]);
    expect(html.ok).toBe(false);
    const products = applyDraftPatch(sampleConfig(), [{ op: 'remove', path: '/pages/1' }]);
    expect(products.ok).toBe(false);
  });

  it('reports patch errors', () => {
    const r = applyDraftPatch(sampleConfig(), [{ op: 'remove', path: '/nope' }]);
    expect(r).toMatchObject({ ok: false });
  });

  it('rethrows unexpected errors', () => {
    // A function cannot be structured-cloned, so the copy fails with a non-patch error.
    expect(() => applyDraftPatch({ fn: () => 1 } as never, [])).toThrow();
  });
});
