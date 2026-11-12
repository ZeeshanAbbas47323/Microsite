import { z } from 'zod';
import { TEXT_LIMITS as L } from './constants';
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
  title: plainText(L.sectionTitle, { min: 1 }),
  subtitle: plainText(L.sectionSubtitle),
  imageUrl: optionalString(imageUrlSchema),
  ctaLabel: plainText(L.ctaLabel),
  ctaLink: optionalString(linkSchema),
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

export const bannerPropsSchema = z.strictObject({
  title: plainText(L.sectionTitle, { min: 1 }),
  ctaLabel: plainText(L.ctaLabel),
  ctaLink: optionalString(linkSchema),
  tone: z.enum(['primary', 'secondary', 'neutral']),
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

export const sectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  productGridSectionSchema,
  richTextSectionSchema,
  imageTextSectionSchema,
  contactInfoSectionSchema,
  faqSectionSchema,
  testimonialsSectionSchema,
  bannerSectionSchema,
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionOfType<T extends Section['type']> = Extract<Section, { type: T }>;
export type SectionProps<T extends Section['type']> = SectionOfType<T>['props'];
