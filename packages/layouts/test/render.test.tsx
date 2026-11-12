import {
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  type SiteConfig,
} from '@microstore/site-schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  onColor,
  ProductDetail,
  Sections,
  SiteShell,
  themeStyle,
  type PublicProduct,
  type RenderContext,
} from '../src/react';

const config: SiteConfig = generateSiteConfig(
  onboardingInputSchema.parse({
    business: {
      name: 'Zara & Crafts',
      tagline: 'Handmade',
      description: 'Bags & more',
      category: 'handmade',
    },
    branding: {
      logoUrl: '',
      primaryColor: '#7c3aed',
      secondaryColor: '#f59e0b',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '03001234567',
      whatsapp: '03001234567',
      email: 'a@b.pk',
      address: 'Gulberg',
      city: 'Lahore',
      social: { facebook: 'https://facebook.com/zara', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: { title: 'Policies', slug: 'policies' } },
    layoutId: 'bold-01',
    subdomain: 'zara',
  }),
  { layoutId: 'bold-01', ...FALLBACK_LAYOUT_DEFAULTS },
  { now: new Date('2026-11-12T00:00:00Z') },
);

const product: PublicProduct = {
  id: 'p1',
  sku: 'S1',
  name: 'Tote </script><script>alert(1)</script>',
  description: 'Nice',
  price: '4500.00',
  compareAtPrice: '5000.00',
  currency: 'PKR',
  images: [{ url: 'https://img.test/a.png', alt: '' }],
  category: { id: 'c', name: 'Bags' },
  featured: true,
  inStock: true,
  variants: [],
};

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    config,
    store: {
      name: 'Zara',
      hostname: 'zara.test',
      currency: 'PKR',
      settings: {
        whatsappButton: true,
        rtl: false,
        shippingFlatFee: '0',
        freeShippingThreshold: null,
      },
    },
    href: (p) => p,
    Link: ({ href, className, children }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
    Image: ({ src, alt }) => <img src={src} alt={alt} />,
    sectionProducts: { 'home-featured': [product] },
    currentPath: '/',
    ...overrides,
  };
}

describe('layout rendering', () => {
  it.each(['bold-01', 'classic-01'])('renders every page of %s without errors', (layoutId) => {
    const c = ctx({ config: { ...config, layoutId } });
    for (const page of config.pages) {
      const html = renderToStaticMarkup(
        <SiteShell ctx={c}>
          <Sections ctx={c} sections={page.sections} />
        </SiteShell>,
      );
      expect(html).toContain('Zara &amp; Crafts');
    }
  });

  it('honours navbar and footer styles (FR-3.3)', () => {
    for (const style of ['centered', 'left', 'split', 'minimal'] as const) {
      for (const footer of ['simple', 'columns', 'minimal'] as const) {
        const c = ctx({
          config: {
            ...config,
            navbar: { ...config.navbar, style, sticky: style === 'left' },
            footer: { ...config.footer, style: footer },
          },
        });
        const html = renderToStaticMarkup(
          <SiteShell ctx={c}>
            <p>x</p>
          </SiteShell>,
        );
        expect(html).toContain('aria-label="Main"');
        expect(html).toContain(config.footer.text.replace('&', '&amp;'));
        expect(html.includes('sticky top-0')).toBe(style === 'left');
      }
    }
  });

  it('escapes product text and shows sale/stock state', () => {
    const html = renderToStaticMarkup(
      <ProductDetail ctx={ctx()} product={product} purchase={<button>Add</button>} />,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('In stock');
    expect(html).toContain('<s ');
  });

  it('hides invisible sections and the WhatsApp button when disabled', () => {
    const page = config.pages[0];
    if (!page) throw new Error('no page');
    const hidden = page.sections.map((s) => ({ ...s, visible: false }));
    const c = ctx({
      store: { ...ctx().store, settings: { ...ctx().store.settings, whatsappButton: false } },
    });
    const html = renderToStaticMarkup(
      <SiteShell ctx={c}>
        <Sections ctx={c} sections={hidden} />
      </SiteShell>,
    );
    expect(html).not.toContain('Shop now');
    expect(html).not.toContain('wa.me');
  });

  it('keeps preview links via ctx.href', () => {
    const c = ctx({ href: (p) => `${p}?preview=t` });
    const html = renderToStaticMarkup(
      <SiteShell ctx={c}>
        <p />
      </SiteShell>,
    );
    expect(html).toContain('href="/products?preview=t"');
  });

  it('sets RTL and theme variables', () => {
    const c = ctx({ store: { ...ctx().store, settings: { ...ctx().store.settings, rtl: true } } });
    expect(
      renderToStaticMarkup(
        <SiteShell ctx={c}>
          <p />
        </SiteShell>,
      ),
    ).toContain('dir="rtl"');
    const style = themeStyle(config) as Record<string, string>;
    expect(style['--ms-primary']).toBe('#7c3aed');
    expect(onColor('#ffffff')).toBe('#111111');
    expect(onColor('#111111')).toBe('#ffffff');
  });

  it('formats money', () => {
    expect(formatMoney('3400.00', 'PKR')).toMatch(/^Rs\s3,400$/);
    expect(formatMoney('99.5', 'PKR')).toMatch(/^Rs\s99\.50$/);
  });
});
