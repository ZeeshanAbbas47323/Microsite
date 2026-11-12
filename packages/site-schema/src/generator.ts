import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, RESERVED_PAGE_SLUGS, TEXT_LIMITS as L } from './constants';
import {
  fontFamilySchema,
  layoutIdSchema,
  siteConfigSchema,
  type Footer,
  type Navbar,
  type Page,
  type SiteConfig,
  type Theme,
} from './config';
import {
  emailSchema,
  facebookUrlSchema,
  hexColorSchema,
  imageUrlSchema,
  instagramUrlSchema,
  optionalString,
  pageSlugSchema,
  pkPhoneSchema,
  plainText,
  sanitizePlainText,
  tiktokUrlSchema,
} from './primitives';
import type { Section } from './sections';
import { subdomainSchema } from './subdomain';

// ---------------------------------------------------------------------------------------------
// Onboarding form (FR-1.2, FR-1.3)

export const BUSINESS_CATEGORIES = [
  'fashion',
  'electronics',
  'beauty',
  'food',
  'grocery',
  'home-decor',
  'handmade',
  'general',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const onboardingInputSchema = z.strictObject({
  business: z.strictObject({
    name: plainText(L.storeName, { min: 1 }),
    tagline: plainText(L.tagline),
    description: plainText(L.description, { multiline: true }),
    category: z.enum(BUSINESS_CATEGORIES),
  }),
  branding: z.strictObject({
    logoUrl: optionalString(imageUrlSchema),
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    fontFamily: fontFamilySchema,
  }),
  contact: z.strictObject({
    phone: pkPhoneSchema,
    whatsapp: optionalString(pkPhoneSchema),
    email: optionalString(emailSchema),
    address: plainText(L.address),
    city: plainText(L.city, { min: 1 }),
    social: z.strictObject({
      facebook: optionalString(facebookUrlSchema),
      instagram: optionalString(instagramUrlSchema),
      tiktok: optionalString(tiktokUrlSchema),
    }),
  }),
  /** Home and Products are always included; these toggle the optional pages. */
  pages: z.strictObject({
    about: z.boolean(),
    contact: z.boolean(),
    custom: z
      .strictObject({
        title: plainText(L.pageTitle, { min: 1 }),
        slug: pageSlugSchema.refine(
          (s) => !(RESERVED_PAGE_SLUGS as readonly string[]).includes(s),
          {
            error: 'This page address is reserved',
          },
        ),
      })
      .refine((p) => p.slug !== 'about' && p.slug !== 'contact', {
        error: 'This page address is already used',
        path: ['slug'],
      })
      .nullable(),
  }),
  layoutId: layoutIdSchema,
  subdomain: subdomainSchema,
});
export type OnboardingInput = z.input<typeof onboardingInputSchema>;
export type OnboardingData = z.output<typeof onboardingInputSchema>;

// ---------------------------------------------------------------------------------------------
// Layout defaults

/** What a layout contributes to a fresh config. Merchant branding overrides colors and font. */
export interface LayoutDefaults {
  layoutId: string;
  theme: Theme;
  navbar: Navbar;
  footer: Pick<Footer, 'style'>;
}

/** Neutral defaults used when a layout does not supply its own (and in tests). */
export const FALLBACK_LAYOUT_DEFAULTS: Omit<LayoutDefaults, 'layoutId'> = {
  theme: {
    primaryColor: '#1a73e8',
    secondaryColor: '#fbbc04',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    fontFamily: 'Inter',
    buttonStyle: 'rounded',
    borderRadius: 'md',
  },
  navbar: {
    style: 'centered',
    sticky: true,
    backgroundColor: '#ffffff',
    textColor: '#111111',
    showCart: true,
  },
  footer: { style: 'simple' },
};

// ---------------------------------------------------------------------------------------------
// Placeholder copy (static templates, FR-2.5: no AI in P0)

interface CategoryCopy {
  heroSubtitle: string;
  featuredTitle: string;
  about: string;
  banner: string;
}

const CATEGORY_COPY: Record<BusinessCategory, CategoryCopy> = {
  fashion: {
    heroSubtitle: 'New styles, everyday comfort. Find something you love.',
    featuredTitle: 'Trending now',
    about: 'We pick every piece with care so you can look and feel your best.',
    banner: 'Cash on delivery available. Order today!',
  },
  electronics: {
    heroSubtitle: 'Reliable gadgets and accessories at fair prices.',
    featuredTitle: 'Top picks',
    about: 'We stock genuine products and stand behind everything we sell.',
    banner: 'Cash on delivery available. Order today!',
  },
  beauty: {
    heroSubtitle: 'Skincare and beauty essentials for your daily routine.',
    featuredTitle: 'Bestsellers',
    about: 'We offer products we trust and use ourselves.',
    banner: 'Cash on delivery available. Order today!',
  },
  food: {
    heroSubtitle: 'Fresh, tasty and made with care.',
    featuredTitle: 'Customer favourites',
    about: 'We prepare everything with quality ingredients and lots of love.',
    banner: 'Order now and pay on delivery.',
  },
  grocery: {
    heroSubtitle: 'Your daily essentials, delivered to your door.',
    featuredTitle: 'Popular items',
    about: 'We make everyday shopping simple, fresh and affordable.',
    banner: 'Order now and pay on delivery.',
  },
  'home-decor': {
    heroSubtitle: 'Make your home feel like you.',
    featuredTitle: 'Featured pieces',
    about: 'We curate decor that brings warmth and character to every room.',
    banner: 'Cash on delivery available. Order today!',
  },
  handmade: {
    heroSubtitle: 'Handcrafted with care, one piece at a time.',
    featuredTitle: 'Featured creations',
    about: 'Every item is made by hand, so each one is a little bit unique.',
    banner: 'Cash on delivery available. Order today!',
  },
  general: {
    heroSubtitle: 'Quality products at prices you will love.',
    featuredTitle: 'Featured products',
    about: 'We are a small business that cares about every order.',
    banner: 'Cash on delivery available. Order today!',
  },
};

// ---------------------------------------------------------------------------------------------
// Generator

function clip(value: string, maxLength: number, multiline = false): string {
  return sanitizePlainText(value, { maxLength, multiline });
}

function seo(title: string, storeName: string, description: string): Page['seo'] {
  return {
    title: clip(`${title} | ${storeName}`, L.seoTitle),
    description: clip(description, L.seoDescription),
  };
}

export interface GenerateOptions {
  /** Used for the footer year; defaults to now. */
  now?: Date;
}

/**
 * Builds the initial draft config from validated onboarding data and the chosen layout's defaults.
 * Deterministic for a given input and `now`. The result always passes `siteConfigSchema`.
 */
export function generateSiteConfig(
  data: OnboardingData,
  layout: LayoutDefaults,
  { now = new Date() }: GenerateOptions = {},
): SiteConfig {
  const { business, branding, contact } = data;
  const copy = CATEGORY_COPY[business.category];
  const name = business.name;
  const summary = business.description || business.tagline || copy.heroSubtitle;

  const homeSections: Section[] = [
    {
      id: 'home-hero',
      type: 'hero',
      visible: true,
      props: {
        title: business.tagline || clip(`Welcome to ${name}`, L.sectionTitle),
        subtitle: clip(business.tagline ? copy.heroSubtitle : summary, L.sectionSubtitle),
        imageUrl: '',
        ctaLabel: 'Shop now',
        ctaLink: '/products',
      },
    },
    {
      id: 'home-featured',
      type: 'productGrid',
      visible: true,
      props: { title: copy.featuredTitle, limit: 8, source: 'featured' },
    },
    {
      id: 'home-banner',
      type: 'banner',
      visible: true,
      props: {
        title: copy.banner,
        ctaLabel: 'Browse products',
        ctaLink: '/products',
        tone: 'secondary',
      },
    },
  ];
  if (data.pages.about) {
    homeSections.push({
      id: 'home-about',
      type: 'imageText',
      visible: true,
      props: {
        title: clip(`About ${name}`, L.sectionTitle),
        body: clip(business.description || copy.about, L.body, true),
        imageUrl: '',
        imagePosition: 'right',
        ctaLabel: 'Learn more',
        ctaLink: '/about',
      },
    });
  }

  const pages: Page[] = [
    {
      slug: 'home',
      template: 'home',
      title: 'Home',
      seo: {
        title: clip(business.tagline ? `${name} | ${business.tagline}` : name, L.seoTitle),
        description: clip(summary, L.seoDescription),
      },
      sections: homeSections,
    },
    {
      slug: 'products',
      template: 'products',
      title: 'Products',
      seo: seo('Products', name, `Shop all products from ${name}. ${copy.heroSubtitle}`),
      sections: [
        {
          id: 'products-all',
          type: 'productGrid',
          visible: true,
          props: { title: 'All products', limit: 24, source: 'all' },
        },
      ],
    },
  ];

  if (data.pages.about) {
    pages.push({
      slug: 'about',
      template: 'about',
      title: 'About us',
      seo: seo('About us', name, business.description || copy.about),
      sections: [
        {
          id: 'about-story',
          type: 'richText',
          visible: true,
          props: {
            title: clip(`About ${name}`, L.sectionTitle),
            paragraphs: [clip(business.description || copy.about, L.body, true)],
          },
        },
      ],
    });
  }

  if (data.pages.contact) {
    pages.push({
      slug: 'contact',
      template: 'contact',
      title: 'Contact',
      seo: seo(
        'Contact',
        name,
        `Get in touch with ${name}${contact.city ? ` in ${contact.city}` : ''}.`,
      ),
      sections: [
        {
          id: 'contact-info',
          type: 'contactInfo',
          visible: true,
          props: {
            title: 'Get in touch',
            subtitle: 'We are happy to help with orders and questions.',
            showWhatsapp: contact.whatsapp !== '',
            showSocial: true,
          },
        },
        {
          id: 'contact-faq',
          type: 'faq',
          visible: true,
          props: {
            title: 'Frequently asked questions',
            items: [
              {
                question: 'How do I pay?',
                answer: 'We accept cash on delivery. You pay when your order arrives.',
              },
              {
                question: 'How will I know my order is confirmed?',
                answer: 'You will see a confirmation with your order number right after checkout.',
              },
            ],
          },
        },
      ],
    });
  }

  if (data.pages.custom) {
    const { title, slug } = data.pages.custom;
    pages.push({
      slug,
      template: 'custom',
      title,
      seo: seo(title, name, `${title} - ${name}`),
      sections: [
        {
          id: 'custom-content',
          type: 'richText',
          visible: true,
          props: { title, paragraphs: ['Add your content here.'] },
        },
      ],
    });
  }

  const config: SiteConfig = {
    version: CURRENT_SCHEMA_VERSION,
    layoutId: layout.layoutId,
    theme: {
      ...layout.theme,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      fontFamily: branding.fontFamily,
    },
    navbar: { ...layout.navbar },
    footer: {
      style: layout.footer.style,
      text: clip(`© ${now.getUTCFullYear()} ${name}`, L.footerText),
    },
    business: {
      name,
      tagline: business.tagline,
      description: business.description,
      category: business.category,
      logoUrl: branding.logoUrl,
      contact: {
        phone: contact.phone,
        whatsapp: contact.whatsapp,
        email: contact.email,
        address: contact.address,
        city: contact.city,
      },
      social: { ...contact.social },
    },
    pages,
  };

  return siteConfigSchema.parse(config);
}

/**
 * Re-targets a config at another layout (FR-3.4): sections, content and theme are kept,
 * only `layoutId` changes.
 */
export function switchLayout(config: SiteConfig, layoutId: string): SiteConfig {
  return siteConfigSchema.parse({ ...structuredClone(config), layoutId });
}
