import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  safeParseSiteConfig,
  switchLayout,
  type LayoutDefaults,
} from '../src';
import { FIXED_NOW, onboardingInput, sampleConfig } from './fixtures';

const layout: LayoutDefaults = { layoutId: 'bold-01', ...FALLBACK_LAYOUT_DEFAULTS };

function generate(overrides: Parameters<typeof onboardingInput>[0] = {}) {
  return generateSiteConfig(onboardingInputSchema.parse(onboardingInput(overrides)), layout, {
    now: FIXED_NOW,
  });
}

describe('onboardingInputSchema', () => {
  it('normalizes phone numbers and the subdomain', () => {
    const data = onboardingInputSchema.parse(onboardingInput({ subdomain: ' Zara-Crafts ' }));
    expect(data.contact.phone).toBe('+923001234567');
    expect(data.subdomain).toBe('zara-crafts');
  });

  it('requires the mandatory fields', () => {
    const bad = onboardingInput();
    bad.business = { ...bad.business, name: '' };
    expect(onboardingInputSchema.safeParse(bad).success).toBe(false);

    const noCity = onboardingInput();
    noCity.contact = { ...noCity.contact, city: '' };
    expect(onboardingInputSchema.safeParse(noCity).success).toBe(false);
  });

  it('rejects invalid phone, subdomain, colors and fonts', () => {
    const cases = [
      onboardingInput({ subdomain: 'admin' }),
      onboardingInput({ layoutId: 'Bad Layout' }),
      { ...onboardingInput(), contact: { ...onboardingInput().contact, phone: '12345' } },
      { ...onboardingInput(), branding: { ...onboardingInput().branding, primaryColor: 'purple' } },
      { ...onboardingInput(), branding: { ...onboardingInput().branding, fontFamily: 'Papyrus' } },
      { ...onboardingInput(), business: { ...onboardingInput().business, category: 'weapons' } },
    ];
    for (const c of cases) expect(onboardingInputSchema.safeParse(c).success).toBe(false);
  });

  it('rejects reserved or clashing custom page slugs', () => {
    for (const slug of ['checkout', 'products', 'about', 'contact', 'Bad Slug']) {
      const input = onboardingInput({
        pages: { about: true, contact: true, custom: { title: 'X', slug } },
      });
      expect(onboardingInputSchema.safeParse(input).success, slug).toBe(false);
    }
  });

  it('rejects unknown fields', () => {
    expect(onboardingInputSchema.safeParse({ ...onboardingInput(), html: '<b>' }).success).toBe(
      false,
    );
  });
});

describe('generateSiteConfig (FR-2.5)', () => {
  it('produces a valid, deterministic config', () => {
    const a = generate();
    expect(safeParseSiteConfig(a).success).toBe(true);
    expect(generate()).toEqual(a);
  });

  it('applies branding over the layout theme', () => {
    const c = generate();
    expect(c.layoutId).toBe('bold-01');
    expect(c.theme.primaryColor).toBe('#7c3aed');
    expect(c.theme.secondaryColor).toBe('#f59e0b');
    expect(c.theme.fontFamily).toBe('Poppins');
    expect(c.theme.backgroundColor).toBe(FALLBACK_LAYOUT_DEFAULTS.theme.backgroundColor);
    expect(c.navbar).toEqual(FALLBACK_LAYOUT_DEFAULTS.navbar);
  });

  it('fills business info and footer', () => {
    const c = generate();
    expect(c.business.name).toBe('Zara Crafts');
    expect(c.business.contact.phone).toBe('+923001234567');
    expect(c.business.social.facebook).toBe('https://facebook.com/zaracrafts');
    expect(c.footer.text).toBe('© 2026 Zara Crafts');
  });

  it('includes all chosen pages in order', () => {
    expect(generate().pages.map((p) => p.slug)).toEqual([
      'home',
      'products',
      'about',
      'contact',
      'policies',
    ]);
  });

  it('creates the minimum two pages when nothing optional is chosen', () => {
    const c = generate({ pages: { about: false, contact: false, custom: null } });
    expect(c.pages.map((p) => p.template)).toEqual(['home', 'products']);
    expect(c.pages[0]?.sections.some((s) => s.id === 'home-about')).toBe(false);
  });

  it('uses fallback copy when tagline and description are empty', () => {
    const c = generate({
      business: { name: 'Ali Mart', tagline: '', description: '', category: 'grocery' },
    });
    const hero = c.pages[0]?.sections[0];
    expect(hero?.type).toBe('hero');
    if (hero?.type === 'hero') {
      expect(hero.props.title).toBe('Welcome to Ali Mart');
      expect(hero.props.subtitle.length).toBeGreaterThan(0);
    }
    expect(c.pages[0]?.seo.title).toBe('Ali Mart');
  });

  it('generates a valid config for every category', () => {
    for (const category of BUSINESS_CATEGORIES) {
      const c = generate({ business: { name: 'Shop', tagline: '', description: '', category } });
      expect(safeParseSiteConfig(c).success, category).toBe(true);
    }
  });

  it('keeps SEO and long names within limits', () => {
    const name = 'N'.repeat(80);
    const c = generate({
      business: {
        name,
        tagline: 'T'.repeat(120),
        description: 'D'.repeat(500),
        category: 'general',
      },
    });
    for (const p of c.pages) {
      expect(p.seo.title.length).toBeLessThanOrEqual(70);
      expect(p.seo.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('hides the WhatsApp toggle when no number is given', () => {
    const base = onboardingInput();
    const c = generate({ contact: { ...base.contact, whatsapp: '' } });
    const info = c.pages.find((p) => p.template === 'contact')?.sections[0];
    expect(info?.type === 'contactInfo' && info.props.showWhatsapp).toBe(false);
  });

  it('defaults `now` to the current date', () => {
    const c = generateSiteConfig(onboardingInputSchema.parse(onboardingInput()), layout);
    expect(c.footer.text).toContain(String(new Date().getUTCFullYear()));
  });
});

describe('switchLayout (FR-3.4)', () => {
  it('changes only layoutId', () => {
    const c = sampleConfig();
    const switched = switchLayout(c, 'classic-01');
    expect(switched.layoutId).toBe('classic-01');
    expect({ ...switched, layoutId: c.layoutId }).toEqual(c);
  });
  it('rejects invalid layout ids', () => {
    expect(() => switchLayout(sampleConfig(), '<script>')).toThrow();
  });
});
