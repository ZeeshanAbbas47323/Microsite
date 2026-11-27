import {
  createSection,
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  type SiteConfig,
} from '@microstore/site-schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Footer,
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
    Image: ({ src, alt, ...rest }) => (
      <img
        src={src}
        alt={alt}
        {...Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-')))}
      />
    ),
    sectionProducts: { 'home-featured': [product] },
    sectionCategories: {
      'home-categories': [
        { id: 'cat-bags', name: 'Bags', imageUrl: '/demo-products/p-1001.webp' },
        { id: 'cat-home', name: 'Home', imageUrl: null },
      ],
    },
    currentPath: '/',
    ...overrides,
  };
}

describe('layout rendering', () => {
  it.each(['bold-01', 'classic-01', 'minimal-01', 'boutique-01', 'market-01'])(
    'renders every page of %s without errors',
    (layoutId) => {
      const c = ctx({ config: { ...config, layoutId } });
      for (const page of config.pages) {
        const html = renderToStaticMarkup(
          <SiteShell ctx={c}>
            <Sections ctx={c} sections={page.sections} />
          </SiteShell>,
        );
        expect(html).toContain('Zara &amp; Crafts');
        if (page.slug === 'home') {
          // Features strip, category tiles and the hero's second button all render.
          expect(html).toContain('Cash on delivery');
          expect(html).toContain('/products?category=cat-bags');
          expect(html).toContain('Shop by category');
        }
      }
    },
  );

  it('aligns the footer bottom line as chosen', () => {
    for (const style of ['simple', 'columns', 'minimal'] as const) {
      for (const [bottomAlign, cls] of [
        ['left', 'text-start'],
        ['center', 'text-center'],
        ['right', 'text-end'],
      ] as const) {
        const c = ctx({ config: { ...config, footer: { ...config.footer, style, bottomAlign } } });
        const html = renderToStaticMarkup(<Footer ctx={c} />);
        if (style === 'simple')
          expect(html).toContain(
            { left: 'sm:justify-start', center: 'sm:justify-center', right: 'sm:justify-end' }[
              bottomAlign
            ],
          );
        else expect(html).toContain(cls);
      }
    }
  });

  it('honours navbar and footer styles (FR-3.3)', () => {
    for (const style of ['centered', 'left', 'split', 'minimal'] as const) {
      for (const footer of ['simple', 'columns', 'minimal'] as const) {
        const c = ctx({
          config: {
            ...config,
            navbar: { ...config.navbar, style, sticky: style === 'left' },
            footer: { ...config.footer, style: footer, about: 'Handmade with care in Lahore.' },
          },
        });
        const html = renderToStaticMarkup(
          <SiteShell ctx={c}>
            <p>x</p>
          </SiteShell>,
        );
        expect(html).toContain('aria-label="Main"');
        expect(html).toContain(config.footer.text.replace('&', '&amp;'));
        expect(html).toContain('Handmade with care in Lahore.');
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

describe('announcement bar', () => {
  const bar = (announcement: Partial<SiteConfig['announcement']>) =>
    renderToStaticMarkup(
      <SiteShell
        ctx={ctx({
          config: { ...config, announcement: { ...config.announcement, ...announcement } },
        })}
      >
        <p>Body</p>
      </SiteShell>,
    );

  it('is hidden while switched off', () => {
    expect(bar({ enabled: false })).not.toContain('Announcements');
  });

  it('shows one message still, with its link', () => {
    const html = bar({ enabled: true, messages: [{ text: 'Free delivery', link: '/products' }] });
    expect(html).toContain('aria-label="Announcements"');
    expect(html).toContain('href="/products"');
    expect(html).not.toContain('@keyframes');
  });

  it('rotates several messages and escapes their text', () => {
    const html = bar({
      enabled: true,
      speed: 3,
      messages: [
        { text: 'One <b>bold</b>', link: '' },
        { text: 'Two', link: 'https://example.com' },
      ],
    });
    expect(html).toContain('@keyframes ms-ann-2');
    expect(html).toContain('ms-ann-2 6s 3s infinite');
    expect(html).toContain('One &lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('prefers-reduced-motion');
  });
});

describe('in-place text editing markers', () => {
  const paths = (html: string) =>
    [...html.matchAll(/data-ms-text="([^"]+)"/g)].map((m) => m[1] ?? '');
  const at = (root: unknown, path: string) =>
    path
      .split('.')
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], root);

  it('points every marked text at the string it shows', () => {
    const c = ctx({ editable: true });
    let count = 0;
    for (const page of config.pages) {
      for (const section of page.sections) {
        const html = renderToStaticMarkup(<Sections ctx={c} sections={[section]} />);
        for (const path of paths(html)) {
          expect(typeof at(section.props, path), `${section.type} ${path}`).toBe('string');
          count += 1;
        }
      }
    }
    const announced = {
      ...config,
      announcement: {
        ...config.announcement,
        enabled: true,
        messages: [{ text: 'Free delivery', link: '/products' }],
      },
      footer: { ...config.footer, about: 'About us' },
    };
    const shell = renderToStaticMarkup(
      <SiteShell ctx={ctx({ editable: true, config: announced })}>
        <p>Body</p>
      </SiteShell>,
    );
    expect(paths(shell)).toEqual(
      expect.arrayContaining(['announcement.messages.0.text', 'footer.text', 'footer.about']),
    );
    for (const path of paths(shell)) expect(typeof at(announced, path)).toBe('string');
    expect(count).toBeGreaterThan(10);
  });

  it('marks section images and the logo as replaceable', () => {
    const withImages: SiteConfig = {
      ...config,
      business: { ...config.business, logoUrl: 'https://img.test/logo.png' },
    };
    const c = ctx({ editable: true, config: withImages });
    const hero = config.pages.flatMap((p) => p.sections).find((s) => s.type === 'hero');
    expect(hero).toBeDefined();
    if (!hero || hero.type !== 'hero') return;
    const html = renderToStaticMarkup(
      <SiteShell ctx={c}>
        <Sections
          ctx={c}
          sections={[{ ...hero, props: { ...hero.props, imageUrl: 'https://img.test/a.png' } }]}
        />
      </SiteShell>,
    );
    expect(html).toContain('data-ms-image="imageUrl"');
    expect(html).toContain('data-ms-image="business.logoUrl" data-ms-image-purpose="logo"');
  });

  it('adds no markers outside the editor', () => {
    const sections = config.pages.flatMap((p) => p.sections);
    const html = renderToStaticMarkup(
      <SiteShell ctx={ctx()}>
        <Sections ctx={ctx()} sections={sections} />
      </SiteShell>,
    );
    expect(html).not.toContain('data-ms-text');
    expect(html).not.toContain('data-ms-image');
  });
});

describe('slideshow', () => {
  const base = createSection('slideshow', []);
  if (base.type !== 'slideshow') throw new Error('wrong type');
  const show = (props: Partial<typeof base.props>, c = ctx()) =>
    renderToStaticMarkup(
      <Sections ctx={c} sections={[{ ...base, props: { ...base.props, ...props } }]} />,
    );
  const slide = {
    imageUrl: '',
    eyebrow: '',
    title: '',
    text: '',
    ctaLabel: '',
    ctaLink: '',
    align: 'center' as const,
  };
  const slides = [
    {
      ...slide,
      imageUrl: 'https://img.test/1.png',
      eyebrow: 'New',
      title: 'Eid <sale>',
      ctaLabel: 'Shop now',
      ctaLink: '/products',
    },
    { ...slide, imageUrl: 'https://img.test/2.png' },
    { ...slide, title: 'Made with care', text: 'Handmade', ctaLink: '/products' },
  ];

  it.each(['overlay', 'split', 'cards'] as const)('renders the %s style', (style) => {
    for (const layoutId of ['bold-01', 'classic-01', 'minimal-01', 'boutique-01', 'market-01']) {
      const html = show({ style, slides }, ctx({ config: { ...config, layoutId } }));
      expect(html).toContain('aria-roledescription="carousel"');
      expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(3);
      expect(html).toContain('Eid &lt;sale&gt;');
      expect(html).toContain('src="https://img.test/2.png"');
      // A link without button text makes the whole slide a link.
      expect(html).toContain('class="absolute inset-0 z-10"');
    }
  });

  it('passes its options to the carousel script', () => {
    const html = show({ autoplay: true, interval: 7, transition: 'fade' });
    expect(html).toContain('data-autoplay="7"');
    expect(html).toContain('data-transition="fade"');
    expect(html).toContain('Pause slideshow');
    expect(html.match(/data-ms-dot=/g)).toHaveLength(3);

    const still = show({ autoplay: false, showDots: false, showArrows: false });
    expect(still).toContain('data-autoplay="0"');
    expect(still).not.toContain('data-ms-dot="');
    expect(still).not.toContain('Previous slide');
    // Cards always slide (fading several cards at once makes no sense).
    expect(show({ style: 'cards', transition: 'fade' })).toContain('data-transition="slide"');
  });

  it('shows one slide without controls', () => {
    const html = show({ slides: slides.slice(0, 1) });
    expect(html).not.toContain('Next slide');
    expect(html).not.toContain('<style>');
  });

  it('marks slide texts and images for editing in the editor', () => {
    const section = { ...base, props: { ...base.props, slides, title: 'Picks' } };
    const html = renderToStaticMarkup(
      <Sections ctx={ctx({ editable: true })} sections={[section]} />,
    );
    const marked = [...html.matchAll(/data-ms-(?:text|image)="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(marked).toEqual(
      expect.arrayContaining(['title', 'slides.0.title', 'slides.0.imageUrl', 'slides.2.text']),
    );
    for (const path of marked) {
      const value = path
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], section.props);
      expect(typeof value, path).toBe('string');
    }
    // In the editor clicks select, so the whole-slide link is left out.
    expect(html).not.toContain('class="absolute inset-0 z-10"');
  });
});
