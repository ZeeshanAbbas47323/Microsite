import { z } from 'zod';
import {
  BORDER_RADII,
  BUTTON_STYLES,
  FEATURE_ICONS,
  SLIDESHOW_TONES,
  SLIDESHOW_TRANSITIONS,
  TEXT_LIMITS as L,
} from './constants';
import { fontFamilySchema, siteConfigSchema, type SiteConfig } from './config';
import { contrastRatio, WCAG_AA_NORMAL } from './contrast';
import {
  BUSINESS_CATEGORIES,
  generateSiteConfig,
  type BusinessCategory,
  type LayoutDefaults,
} from './generator';
import { hexColorSchema, plainText, sanitizePlainText } from './primitives';
import type { Section } from './sections';

/*
 * "Magic store": a short brief, written by the AI from one sentence about the business, turned
 * into a complete store design. The brief only carries words, colors and choices from fixed lists;
 * structure, links and everything else come from our own templates, and the result is validated
 * like any other draft.
 */

/** AI text: markup stripped and length cut first (like command values), then validated. */
const clean = (max: number, { min = 0, multiline = false } = {}) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? sanitizePlainText(v, { maxLength: max, multiline }) : v),
    plainText(max, { min, multiline }),
  );
const text = (max: number, min = 0) => clean(max, { min });

export const storeBriefSchema = z.object({
  business: z.object({
    tagline: text(L.tagline),
    description: clean(L.description, { multiline: true }),
    category: z.enum(BUSINESS_CATEGORIES),
  }),
  layoutId: z.string().max(40),
  theme: z.object({
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    backgroundColor: hexColorSchema,
    textColor: hexColorSchema,
    fontFamily: fontFamilySchema,
    buttonStyle: z.enum(BUTTON_STYLES),
    borderRadius: z.enum(BORDER_RADII),
  }),
  navbar: z.object({ backgroundColor: hexColorSchema, textColor: hexColorSchema }),
  hero: z.object({
    eyebrow: text(L.ctaLabel),
    title: text(L.sectionTitle, 1),
    subtitle: text(L.sectionSubtitle),
    ctaLabel: text(L.ctaLabel, 1),
  }),
  features: z
    .array(
      z.object({
        icon: z.enum(FEATURE_ICONS),
        title: text(L.ctaLabel, 1),
        text: text(L.sectionSubtitle),
      }),
    )
    .min(3)
    .max(4),
  featuredTitle: text(L.sectionTitle, 1),
  banner: text(L.sectionTitle, 1),
  about: z.object({
    title: text(L.sectionTitle, 1),
    body: clean(L.body, { multiline: true, min: 1 }),
  }),
  story: clean(L.body, { multiline: true, min: 1 }),
  faq: z
    .array(
      z.object({
        question: text(L.sectionSubtitle, 1),
        answer: clean(L.shortBody, { multiline: true, min: 1 }),
      }),
    )
    .min(3)
    .max(5),
  seo: z.object({ title: text(L.seoTitle, 1), description: text(L.seoDescription) }),
  footerAbout: clean(L.footerAbout, { multiline: true }),
  /**
   * A short carousel of highlights for the home page (text slides on the brand colours; the owner
   * adds photos later). Optional so older briefs still apply.
   */
  slideshow: z
    .object({
      style: z.enum(['overlay', 'cards']),
      tone: z.enum(SLIDESHOW_TONES),
      transition: z.enum(SLIDESHOW_TRANSITIONS),
      slides: z
        .array(
          z.object({
            eyebrow: text(L.ctaLabel),
            title: text(L.sectionTitle, 1),
            text: text(L.sectionSubtitle),
            ctaLabel: text(L.ctaLabel),
          }),
        )
        .min(2)
        .max(4),
    })
    .optional(),
});
export type StoreBrief = z.output<typeof storeBriefSchema>;

/** Readable text color for a background: the brief's choice, or black/white if it fails AA. */
function readable(fg: string, bg: string): string {
  if (contrastRatio(fg, bg) >= WCAG_AA_NORMAL) return fg;
  return contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg) ? '#ffffff' : '#111111';
}

type Props<T extends Section['type']> = Extract<Section, { type: T }>['props'];

/** Fixed template labels, for stores written in Urdu. */
const URDU_LABELS: Record<string, string> = {
  'Our story': 'ہماری کہانی',
  'Shop by category': 'زمرے کے مطابق خریدیں',
  'New arrivals': 'نئی آمد',
  'Questions? We have answers': 'سوالات اور جوابات',
  'What we care about': 'ہمارے اصول',
  'Shop our products': 'ہماری مصنوعات دیکھیں',
  'Get in touch': 'ہم سے رابطہ کریں',
  'Frequently asked questions': 'اکثر پوچھے گئے سوالات',
  'Read our story': 'ہماری کہانی پڑھیں',
  'Browse products': 'مصنوعات دیکھیں',
};

/**
 * A full store design from a brief. Keeps the store's name, logo, contact details, custom page and
 * which optional pages exist; replaces theme, layout and the content of Home, About and Contact.
 */
export function applyStoreBrief(
  current: SiteConfig,
  brief: StoreBrief,
  layout: LayoutDefaults,
  options: { now?: Date; logoUrl?: string; language?: 'en' | 'ur' } = {},
): SiteConfig {
  const { business } = current;
  const has = (slug: string) => current.pages.some((p) => p.slug === slug);
  const fresh = generateSiteConfig(
    {
      business: {
        name: business.name,
        tagline: brief.business.tagline,
        description: brief.business.description,
        category: brief.business.category as BusinessCategory,
      },
      branding: {
        logoUrl: options.logoUrl ?? business.logoUrl,
        primaryColor: brief.theme.primaryColor,
        secondaryColor: brief.theme.secondaryColor,
        fontFamily: brief.theme.fontFamily,
      },
      contact: { ...business.contact, social: { ...business.social } },
      pages: { about: has('about'), contact: has('contact'), custom: null },
      layoutId: layout.layoutId,
      subdomain: 'placeholder',
    },
    layout,
    options.now ? { now: options.now } : {},
  );

  const backgroundColor = brief.theme.backgroundColor;
  const config: SiteConfig = {
    ...fresh,
    theme: {
      ...brief.theme,
      textColor: readable(brief.theme.textColor, backgroundColor),
    },
    navbar: {
      ...fresh.navbar,
      backgroundColor: brief.navbar.backgroundColor,
      textColor: readable(brief.navbar.textColor, brief.navbar.backgroundColor),
    },
    footer: { ...fresh.footer, text: current.footer.text, about: brief.footerAbout },
  };

  for (const page of config.pages) {
    for (const section of page.sections) {
      if (page.slug === 'home') {
        if (section.type === 'hero') {
          Object.assign(section.props as Props<'hero'>, {
            eyebrow: brief.hero.eyebrow,
            title: brief.hero.title,
            subtitle: brief.hero.subtitle,
            ctaLabel: brief.hero.ctaLabel,
          });
        } else if (section.type === 'features') {
          (section.props as Props<'features'>).items = brief.features;
        } else if (section.type === 'productGrid' && section.props.source === 'featured') {
          section.props.title = brief.featuredTitle;
        } else if (section.type === 'banner') {
          section.props.title = brief.banner;
        } else if (section.type === 'imageText') {
          Object.assign(section.props as Props<'imageText'>, brief.about);
        } else if (section.type === 'faq') {
          section.props.items = brief.faq;
        }
      } else if (page.slug === 'about') {
        if (section.type === 'imageText') section.props.body = brief.about.body;
        if (section.type === 'richText') section.props.paragraphs = [brief.story];
      }
    }
    if (page.slug === 'home') page.seo = { ...brief.seo };
  }

  // The brief's highlights become a slideshow right under the store promises (or the hero).
  if (brief.slideshow) {
    const home = config.pages.find((p) => p.slug === 'home');
    if (home) {
      const { style, tone, transition, slides } = brief.slideshow;
      const props: Props<'slideshow'> = {
        title: '',
        style,
        height: 'small',
        transition: style === 'cards' ? 'slide' : transition,
        perView: 3,
        fullWidth: false,
        imageSide: 'left',
        overlay: 40,
        tone,
        autoplay: true,
        interval: 5,
        showArrows: true,
        showDots: true,
        // Buttons always lead to the store's own products: the AI never chooses a link.
        slides: slides.map((s) => ({
          imageUrl: '',
          eyebrow: s.eyebrow,
          title: s.title,
          text: s.text,
          ctaLabel: s.ctaLabel,
          ctaLink: s.ctaLabel ? '/products' : '',
          align: 'center',
        })),
      };
      const after = home.sections.findIndex((s) => s.type === 'features');
      const at = after >= 0 ? after + 1 : home.sections.findIndex((s) => s.type === 'hero') + 1;
      home.sections.splice(at, 0, {
        id: 'home-highlights',
        type: 'slideshow',
        visible: true,
        props,
      });
    }
  }

  // Urdu stores: an Urdu font, and the template's own labels in Urdu too.
  if (options.language === 'ur') {
    config.theme.fontFamily = 'Noto Nastaliq Urdu';
    for (const page of config.pages) {
      for (const section of page.sections) {
        const props = section.props as Record<string, unknown>;
        for (const key of ['title', 'ctaLabel', 'secondaryCtaLabel'] as const) {
          const value = props[key];
          if (typeof value === 'string' && URDU_LABELS[value]) props[key] = URDU_LABELS[value];
        }
      }
    }
  }

  // The custom page (if any) is the merchant's own: keep it as it was.
  const custom = current.pages.find((p) => p.template === 'custom');
  if (custom) config.pages.push(structuredClone(custom));

  return siteConfigSchema.parse(config);
}
