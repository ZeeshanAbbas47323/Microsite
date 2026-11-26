/** Current site config schema version. Bump it and add a migration in `migrate.ts` on breaking changes. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/** Fonts a merchant (or the command box) may choose. Layouts must be able to load every one of these. */
export const FONT_WHITELIST = [
  'Inter',
  'Poppins',
  'Sora',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'Noto Nastaliq Urdu',
] as const;
export type FontFamily = (typeof FONT_WHITELIST)[number];

export const BUTTON_STYLES = ['rounded', 'pill', 'square'] as const;
export const BORDER_RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const NAVBAR_STYLES = ['centered', 'left', 'split', 'minimal'] as const;
export const FOOTER_STYLES = ['simple', 'columns', 'minimal'] as const;
/**
 * Alignment of the footer's bottom line. `auto` keeps each footer style's own alignment; left and
 * right follow the reading direction (RTL mirrors them).
 */
export const FOOTER_ALIGNS = ['auto', 'left', 'center', 'right'] as const;

export const SECTION_TYPES = [
  'hero',
  'productGrid',
  'richText',
  'imageText',
  'contactInfo',
  'faq',
  'testimonials',
  'banner',
  'features',
  'categoryGrid',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Merchant-facing names and one-line descriptions of section types (editor and preview). */
export const SECTION_INFO: Record<SectionType, { label: string; description: string }> = {
  hero: { label: 'Hero banner', description: 'Big headline with buttons at the top of a page.' },
  features: { label: 'Features', description: 'Icons with short promises: delivery, payment...' },
  categoryGrid: {
    label: 'Shop by category',
    description: 'Photo tiles for your product categories.',
  },
  productGrid: { label: 'Product grid', description: 'Featured, newest or all products.' },
  imageText: {
    label: 'Image with text',
    description: 'A photo beside a short story and a button.',
  },
  richText: { label: 'Text', description: 'A heading and paragraphs of text.' },
  banner: { label: 'Announcement', description: 'A colored strip with one message and a link.' },
  testimonials: { label: 'Testimonials', description: 'Quotes from real customers.' },
  faq: { label: 'FAQ', description: 'Questions and answers that open on tap.' },
  contactInfo: { label: 'Contact details', description: 'Phone, WhatsApp, email and address.' },
};

/** Content page templates stored in the config. They count towards the 2 to 5 page limit. */
export const CONTENT_PAGE_TEMPLATES = ['home', 'products', 'about', 'contact', 'custom'] as const;
export type ContentPageTemplate = (typeof CONTENT_PAGE_TEMPLATES)[number];

/** Pages every layout renders on its own. They are never stored in `pages` and never counted. */
export const SYSTEM_PAGES = ['productDetail', 'cart', 'checkout', 'orderConfirmation'] as const;
export type SystemPage = (typeof SYSTEM_PAGES)[number];

export const MIN_CONTENT_PAGES = 2;
export const MAX_CONTENT_PAGES = 5;
export const MAX_SECTIONS_PER_PAGE = 20;

/** Icons a `features` item may show; layouts draw each one as inline SVG. */
export const FEATURE_ICONS = [
  'truck',
  'cash',
  'exchange',
  'shield',
  'star',
  'phone',
  'gift',
  'leaf',
  'clock',
  'heart',
] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];

/** Templates whose slug is fixed (routing depends on it). */
export const FIXED_PAGE_SLUGS: Partial<Record<ContentPageTemplate, string>> = {
  home: 'home',
  products: 'products',
};

/** Slugs a custom/about/contact page may not use because the storefront routes them itself. */
export const RESERVED_PAGE_SLUGS = [
  'home',
  'products',
  'product',
  'p',
  'cart',
  'checkout',
  'order',
  'orders',
  'track',
  'search',
  'api',
  'sitemap.xml',
  'robots.txt',
  '_next',
  '_sites',
  'preview',
  'admin',
  'dashboard',
] as const;

/** Max lengths for plain-text fields. Shared by the schema and the command-patch validator. */
export const TEXT_LIMITS = {
  storeName: 80,
  tagline: 120,
  description: 500,
  pageTitle: 60,
  seoTitle: 70,
  seoDescription: 160,
  sectionTitle: 120,
  sectionSubtitle: 240,
  ctaLabel: 40,
  body: 2000,
  shortBody: 600,
  footerText: 200,
  footerAbout: 300,
  announcement: 100,
  address: 250,
  city: 80,
  author: 80,
} as const;

/** Announcement bar above the header: how many messages and how fast they rotate. */
export const MAX_ANNOUNCEMENTS = 5;
export const ANNOUNCEMENT_SPEEDS = [3, 5, 7, 10] as const;

/** Subdomain rules (FR-1.4). */
export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 30;
export const RESERVED_SUBDOMAINS = [
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'email',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'dashboard',
  'static',
  'assets',
  'cdn',
  'media',
  'img',
  'images',
  'files',
  'uploads',
  'blog',
  'help',
  'support',
  'docs',
  'status',
  'dev',
  'staging',
  'test',
  'demo',
  'preview',
  'sso',
  'auth',
  'login',
  'account',
  'accounts',
  'billing',
  'shop',
  'store',
  'stores',
  'microstore',
  'getorio',
  'root',
  'system',
  'internal',
  'ns1',
  'ns2',
] as const;
