import { z } from 'zod';
import {
  FEATURE_ICONS,
  MAX_SLIDES,
  SLIDE_ALIGNS,
  SLIDESHOW_HEIGHTS,
  SLIDESHOW_INTERVALS,
  SLIDESHOW_STYLES,
  SLIDESHOW_TONES,
  SLIDESHOW_TRANSITIONS,
  TEXT_LIMITS as L,
} from './constants';
import {
  imageUrlSchema,
  linkSchema,
  optionalString,
  plainText,
  sectionIdSchema,
} from './primitives';

// Every props object is strict: unknown keys are rejected so nothing can smuggle extra data
// (e.g. raw HTML or style overrides) into a layout.

export const heroPropsSchema = z.strictObject({
  /** Small line above the title, e.g. "New collection". */
  eyebrow: plainText(L.ctaLabel).default(''),
  title: plainText(L.sectionTitle, { min: 1 }),
  subtitle: plainText(L.sectionSubtitle),
  imageUrl: optionalString(imageUrlSchema),
  ctaLabel: plainText(L.ctaLabel),
  ctaLink: optionalString(linkSchema),
  secondaryCtaLabel: plainText(L.ctaLabel).default(''),
  secondaryCtaLink: optionalString(linkSchema).default(''),
});

export const PRODUCT_GRID_SOURCES = ['featured', 'all', 'latest', 'category'] as const;

export const productGridPropsSchema = z
  .strictObject({
    title: plainText(L.sectionTitle),
    limit: z.number().int().min(1).max(24),
    source: z.enum(PRODUCT_GRID_SOURCES),
    categoryId: z.string().max(64).optional(),
  })
  .refine((p) => p.source !== 'category' || Boolean(p.categoryId), {
    error: 'categoryId is required when source is "category"',
    path: ['categoryId'],
  });

export const richTextPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  /** Paragraphs of plain text. Rendered as escaped text, never as HTML. */
  paragraphs: z.array(plainText(L.body, { multiline: true })).max(20),
});

export const imageTextPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  body: plainText(L.body, { multiline: true }),
  imageUrl: optionalString(imageUrlSchema),
  imagePosition: z.enum(['left', 'right']),
  ctaLabel: plainText(L.ctaLabel),
  ctaLink: optionalString(linkSchema),
});

/** Reads phone/email/address from `business.contact`; props only control presentation. */
export const contactInfoPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  subtitle: plainText(L.sectionSubtitle),
  showWhatsapp: z.boolean(),
  showSocial: z.boolean(),
});

export const faqPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  items: z
    .array(
      z.strictObject({
        question: plainText(L.sectionSubtitle, { min: 1 }),
        answer: plainText(L.shortBody, { multiline: true, min: 1 }),
      }),
    )
    .max(20),
});

export const testimonialsPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  items: z
    .array(
      z.strictObject({
        quote: plainText(L.shortBody, { min: 1 }),
        author: plainText(L.author, { min: 1 }),
        role: plainText(L.author),
      }),
    )
    .max(12),
});

/** Store promises in a row: delivery, payment, returns... */
export const featuresPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  items: z
    .array(
      z.strictObject({
        icon: z.enum(FEATURE_ICONS),
        title: plainText(L.ctaLabel, { min: 1 }),
        text: plainText(L.sectionSubtitle),
      }),
    )
    .max(6),
});

/** Tiles for the store's product categories (from Getorio), each showing a product photo. */
export const categoryGridPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle),
  subtitle: plainText(L.sectionSubtitle),
  limit: z.number().int().min(2).max(8),
});

export const bannerPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle, { min: 1 }),
  ctaLabel: plainText(L.ctaLabel),
  ctaLink: optionalString(linkSchema),
  tone: z.enum(['primary', 'secondary', 'neutral']),
});

/**
 * One slide. Every part is optional so a slide can be image only, text only, image + text, with or
 * without a button; it just has to show something. A link without button text makes the whole
 * slide clickable.
 */
export const slideSchema = z
  .strictObject({
    imageUrl: optionalString(imageUrlSchema).default(''),
    eyebrow: plainText(L.ctaLabel).default(''),
    title: plainText(L.sectionTitle).default(''),
    text: plainText(L.sectionSubtitle, { multiline: true }).default(''),
    ctaLabel: plainText(L.ctaLabel).default(''),
    ctaLink: optionalString(linkSchema).default(''),
    align: z.enum(SLIDE_ALIGNS).default('center'),
  })
  .refine((s) => Boolean(s.imageUrl || s.title || s.text || s.eyebrow), {
    error: 'A slide needs an image or some text',
    path: ['title'],
  });

/** A carousel: sliding or fading slides, autoplay, arrows and dots, in three looks. */
export const slideshowPropsSchema = z.strictObject({
  /** Optional heading above the slides. */
  title: plainText(L.sectionTitle).default(''),
  style: z.enum(SLIDESHOW_STYLES).default('overlay'),
  height: z.enum(SLIDESHOW_HEIGHTS).default('medium'),
  transition: z.enum(SLIDESHOW_TRANSITIONS).default('slide'),
  /** Cards visible at once on wide screens (cards style). */
  perView: z.number().int().min(1).max(4).default(3),
  /** Edge to edge, or inside the page width with rounded corners. */
  fullWidth: z.boolean().default(true),
  /** Split style: which side the image sits on. */
  imageSide: z.enum(['left', 'right']).default('left'),
  /** Darkening over images so text stays readable (percent). */
  overlay: z.number().int().min(0).max(80).default(40),
  /** Background (and text colour) of slides without an image. */
  tone: z.enum(SLIDESHOW_TONES).default('dark'),
  autoplay: z.boolean().default(true),
  /** Seconds per slide while playing. */
  interval: z.literal(SLIDESHOW_INTERVALS).default(5),
  showArrows: z.boolean().default(true),
  showDots: z.boolean().default(true),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
});

const sectionBase = {
  id: sectionIdSchema,
  visible: z.boolean(),
};

export const heroSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('hero'),
  props: heroPropsSchema,
});
export const productGridSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('productGrid'),
  props: productGridPropsSchema,
});
export const richTextSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('richText'),
  props: richTextPropsSchema,
});
export const imageTextSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('imageText'),
  props: imageTextPropsSchema,
});
export const contactInfoSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('contactInfo'),
  props: contactInfoPropsSchema,
});
export const faqSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('faq'),
  props: faqPropsSchema,
});
export const testimonialsSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('testimonials'),
  props: testimonialsPropsSchema,
});
export const bannerSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('banner'),
  props: bannerPropsSchema,
});

export const featuresSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('features'),
  props: featuresPropsSchema,
});
export const categoryGridSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('categoryGrid'),
  props: categoryGridPropsSchema,
});

export const slideshowSectionSchema = z.strictObject({
  ...sectionBase,
  type: z.literal('slideshow'),
  props: slideshowPropsSchema,
});

export const sectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  productGridSectionSchema,
  richTextSectionSchema,
  imageTextSectionSchema,
  contactInfoSectionSchema,
  faqSectionSchema,
  testimonialsSectionSchema,
  bannerSectionSchema,
  featuresSectionSchema,
  categoryGridSectionSchema,
  slideshowSectionSchema,
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionOfType<T extends Section['type']> = Extract<Section, { type: T }>;
export type SectionProps<T extends Section['type']> = SectionOfType<T>['props'];
export type Slide = z.infer<typeof slideSchema>;
