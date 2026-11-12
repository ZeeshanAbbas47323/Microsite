import { describe, expect, it } from 'vitest';
import { parseSiteConfig, safeParseSiteConfig, sectionSchema, type SiteConfig } from '../src';
import { sampleConfig } from './fixtures';

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test helper for invalid shapes

function mutate(fn: (c: Mutable) => void): unknown {
  const c = structuredClone(sampleConfig()) as Mutable;
  fn(c);
  return c;
}

function messages(input: unknown): string[] {
  const r = safeParseSiteConfig(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe('siteConfigSchema', () => {
  it('accepts the generated sample config and is idempotent', () => {
    const config = sampleConfig();
    expect(parseSiteConfig(config)).toEqual(config);
  });

  it('rejects unknown keys anywhere (strict objects)', () => {
    expect(safeParseSiteConfig(mutate((c) => (c.customCss = 'body{}'))).success).toBe(false);
    expect(safeParseSiteConfig(mutate((c) => (c.theme.css = 'x'))).success).toBe(false);
    expect(
      safeParseSiteConfig(mutate((c) => (c.pages[0].sections[0].props.html = '<b>'))).success,
    ).toBe(false);
    expect(safeParseSiteConfig(mutate((c) => (c.pages[0].sections[0].style = 'x'))).success).toBe(
      false,
    );
  });

  it('rejects wrong version', () => {
    expect(safeParseSiteConfig(mutate((c) => (c.version = 2))).success).toBe(false);
  });

  it('validates theme values', () => {
    expect(safeParseSiteConfig(mutate((c) => (c.theme.primaryColor = 'blue'))).success).toBe(false);
    expect(safeParseSiteConfig(mutate((c) => (c.theme.primaryColor = '#abc'))).success).toBe(true);
    expect(safeParseSiteConfig(mutate((c) => (c.theme.fontFamily = 'Comic Sans MS'))).success).toBe(
      false,
    );
    expect(safeParseSiteConfig(mutate((c) => (c.theme.buttonStyle = 'blob'))).success).toBe(false);
    expect(safeParseSiteConfig(mutate((c) => (c.navbar.sticky = 'yes'))).success).toBe(false);
  });

  it('rejects HTML in merchant text', () => {
    expect(
      safeParseSiteConfig(mutate((c) => (c.business.name = '<script>x</script>'))).success,
    ).toBe(false);
    expect(safeParseSiteConfig(mutate((c) => (c.footer.text = '<a href=x>hi</a>'))).success).toBe(
      false,
    );
    expect(
      safeParseSiteConfig(
        mutate((c) => (c.pages[0].sections[0].props.title = '<img src=x onerror=1>')),
      ).success,
    ).toBe(false);
  });

  it('rejects unsafe links and images', () => {
    expect(
      safeParseSiteConfig(
        mutate((c) => (c.pages[0].sections[0].props.ctaLink = 'javascript:alert(1)')),
      ).success,
    ).toBe(false);
    expect(
      safeParseSiteConfig(mutate((c) => (c.business.logoUrl = 'http://x.com/a.png'))).success,
    ).toBe(false);
  });

  it('normalizes contact phone numbers', () => {
    const parsed = parseSiteConfig(mutate((c) => (c.business.contact.phone = '0312-3456789')));
    expect(parsed.business.contact.phone).toBe('+923123456789');
    expect(safeParseSiteConfig(mutate((c) => (c.business.contact.phone = '12345'))).success).toBe(
      false,
    );
    expect(
      parseSiteConfig(mutate((c) => (c.business.contact.email = ''))).business.contact.email,
    ).toBe('');
  });

  it('enforces 2 to 5 content pages', () => {
    expect(messages(mutate((c) => (c.pages = c.pages.slice(0, 1)))).length).toBeGreaterThan(0);
    const six = mutate((c) => {
      c.pages.push({ ...structuredClone(c.pages[2]), slug: 'more' });
    });
    expect(safeParseSiteConfig(six).success).toBe(false);
  });

  it('requires home and products pages', () => {
    const noProducts = mutate((c) => {
      c.pages = c.pages.filter((p: Mutable) => p.template !== 'products');
    });
    expect(messages(noProducts)).toContain('A "products" page is required');
  });

  it('allows only one page per template', () => {
    const twoCustom = mutate((c) => {
      const custom = c.pages.find((p: Mutable) => p.template === 'custom');
      c.pages = c.pages.filter((p: Mutable) => p.template !== 'about');
      c.pages.push({
        ...structuredClone(custom),
        slug: 'shipping',
        sections: [{ ...custom.sections[0], id: 'other' }],
      });
    });
    expect(messages(twoCustom)).toContain('Only one "custom" page is allowed');
  });

  it('rejects duplicate slugs and section ids', () => {
    const dupSlug = mutate((c) => {
      c.pages.find((p: Mutable) => p.template === 'custom').slug = 'about';
    });
    expect(messages(dupSlug)).toContain('Duplicate slug "about"');
    const dupId = mutate((c) => (c.pages[1].sections[0].id = c.pages[0].sections[0].id));
    expect(messages(dupId).some((m) => m.startsWith('Duplicate section id'))).toBe(true);
  });

  it('fixes the home/products slugs and blocks reserved slugs', () => {
    expect(messages(mutate((c) => (c.pages[0].slug = 'start')))).toContain(
      'The home page slug must be "home"',
    );
    const reserved = mutate((c) => {
      c.pages.find((p: Mutable) => p.template === 'custom').slug = 'checkout';
    });
    expect(messages(reserved)).toContain('"checkout" is reserved');
    expect(safeParseSiteConfig(mutate((c) => (c.pages[2].slug = 'Our Story'))).success).toBe(false);
  });

  it('limits sections per page', () => {
    const many = mutate((c) => {
      const base = c.pages[1].sections[0];
      c.pages[1].sections = Array.from({ length: 21 }, (_, i) => ({ ...base, id: `s${i}` }));
    });
    expect(safeParseSiteConfig(many).success).toBe(false);
  });

  it('round-trips through JSON', () => {
    const config: SiteConfig = sampleConfig();
    expect(parseSiteConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });
});

describe('sectionSchema', () => {
  const ok = (s: unknown) => sectionSchema.safeParse(s).success;

  it('rejects unknown section types', () => {
    expect(ok({ id: 'x', type: 'customHtml', visible: true, props: { html: '<b>' } })).toBe(false);
  });

  it('validates every MVP section type', () => {
    expect(
      ok({
        id: 'h',
        type: 'hero',
        visible: true,
        props: { title: 'Hi', subtitle: '', imageUrl: '', ctaLabel: '', ctaLink: '' },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'g',
        type: 'productGrid',
        visible: true,
        props: { title: '', limit: 8, source: 'featured' },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'g',
        type: 'productGrid',
        visible: true,
        props: { title: '', limit: 99, source: 'all' },
      }),
    ).toBe(false);
    expect(
      ok({
        id: 'g',
        type: 'productGrid',
        visible: true,
        props: { title: '', limit: 4, source: 'category' },
      }),
    ).toBe(false);
    expect(
      ok({
        id: 'g',
        type: 'productGrid',
        visible: true,
        props: { title: '', limit: 4, source: 'category', categoryId: 'bags' },
      }),
    ).toBe(true);
    expect(
      ok({ id: 'r', type: 'richText', visible: true, props: { title: '', paragraphs: ['a\nb'] } }),
    ).toBe(true);
    expect(
      ok({
        id: 'i',
        type: 'imageText',
        visible: false,
        props: {
          title: '',
          body: 'x',
          imageUrl: '',
          imagePosition: 'left',
          ctaLabel: '',
          ctaLink: '',
        },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'c',
        type: 'contactInfo',
        visible: true,
        props: { title: '', subtitle: '', showWhatsapp: true, showSocial: false },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'f',
        type: 'faq',
        visible: true,
        props: { title: '', items: [{ question: 'Q', answer: 'A' }] },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'f',
        type: 'faq',
        visible: true,
        props: { title: '', items: [{ question: '', answer: 'A' }] },
      }),
    ).toBe(false);
    expect(
      ok({
        id: 't',
        type: 'testimonials',
        visible: true,
        props: { title: '', items: [{ quote: 'Great', author: 'Ali', role: '' }] },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'b',
        type: 'banner',
        visible: true,
        props: { title: 'Sale', ctaLabel: '', ctaLink: '', tone: 'primary' },
      }),
    ).toBe(true);
    expect(
      ok({
        id: 'b',
        type: 'banner',
        visible: true,
        props: { title: 'Sale', ctaLabel: '', ctaLink: '', tone: 'red' },
      }),
    ).toBe(false);
  });

  it('rejects bad section ids', () => {
    expect(
      ok({ id: 'a b', type: 'richText', visible: true, props: { title: '', paragraphs: [] } }),
    ).toBe(false);
    expect(
      ok({ id: '', type: 'richText', visible: true, props: { title: '', paragraphs: [] } }),
    ).toBe(false);
  });
});
