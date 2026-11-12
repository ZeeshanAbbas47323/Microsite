import { z } from 'zod';
import {
  BORDER_RADII,
  BUTTON_STYLES,
  CONTENT_PAGE_TEMPLATES,
  CURRENT_SCHEMA_VERSION,
  FIXED_PAGE_SLUGS,
  FONT_WHITELIST,
  FOOTER_STYLES,
  MAX_CONTENT_PAGES,
  MAX_SECTIONS_PER_PAGE,
  MIN_CONTENT_PAGES,
  NAVBAR_STYLES,
  RESERVED_PAGE_SLUGS,
  TEXT_LIMITS as L,
} from './constants';
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
  tiktokUrlSchema,
} from './primitives';
import { sectionSchema } from './sections';

export const fontFamilySchema = z.enum(FONT_WHITELIST);

export const themeSchema = z.strictObject({
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  textColor: hexColorSchema,
  fontFamily: fontFamilySchema,
  buttonStyle: z.enum(BUTTON_STYLES),
  borderRadius: z.enum(BORDER_RADII),
});

export const navbarSchema = z.strictObject({
  style: z.enum(NAVBAR_STYLES),
  sticky: z.boolean(),
  backgroundColor: hexColorSchema,
  textColor: hexColorSchema,
  showCart: z.boolean(),
});

export const footerSchema = z.strictObject({
  style: z.enum(FOOTER_STYLES),
  text: plainText(L.footerText),
});

export const contactSchema = z.strictObject({
  phone: optionalString(pkPhoneSchema),
  whatsapp: optionalString(pkPhoneSchema),
  email: optionalString(emailSchema),
  address: plainText(L.address),
  city: plainText(L.city),
});

export const socialSchema = z.strictObject({
  facebook: optionalString(facebookUrlSchema),
  instagram: optionalString(instagramUrlSchema),
  tiktok: optionalString(tiktokUrlSchema),
});

export const businessSchema = z.strictObject({
  name: plainText(L.storeName, { min: 1 }),
  tagline: plainText(L.tagline),
  description: plainText(L.description, { multiline: true }),
  category: z.string().regex(/^[a-z0-9-]{1,40}$/),
  logoUrl: optionalString(imageUrlSchema),
  contact: contactSchema,
  social: socialSchema,
});

export const seoSchema = z.strictObject({
  title: plainText(L.seoTitle),
  description: plainText(L.seoDescription),
});

export const pageSchema = z
  .strictObject({
    slug: pageSlugSchema,
    template: z.enum(CONTENT_PAGE_TEMPLATES),
    title: plainText(L.pageTitle, { min: 1 }),
    seo: seoSchema,
    sections: z.array(sectionSchema).max(MAX_SECTIONS_PER_PAGE),
  })
  .superRefine((page, ctx) => {
    const fixed = FIXED_PAGE_SLUGS[page.template];
    if (fixed !== undefined && page.slug !== fixed) {
      ctx.addIssue({
        code: 'custom',
        path: ['slug'],
        message: `The ${page.template} page slug must be "${fixed}"`,
      });
    }
    if (fixed === undefined && (RESERVED_PAGE_SLUGS as readonly string[]).includes(page.slug)) {
      ctx.addIssue({ code: 'custom', path: ['slug'], message: `"${page.slug}" is reserved` });
    }
  });

/** Layout ids are validated for format here; the layouts registry checks that the id exists. */
export const layoutIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(40);

export const siteConfigSchema = z
  .strictObject({
    version: z.literal(CURRENT_SCHEMA_VERSION),
    layoutId: layoutIdSchema,
    theme: themeSchema,
    navbar: navbarSchema,
    footer: footerSchema,
    business: businessSchema,
    pages: z.array(pageSchema).min(MIN_CONTENT_PAGES).max(MAX_CONTENT_PAGES),
  })
  .superRefine((config, ctx) => {
    const templates = new Map<string, number>();
    const slugs = new Map<string, number>();
    const sectionIds = new Map<string, string>();

    config.pages.forEach((page, pageIndex) => {
      if (templates.has(page.template)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pages', pageIndex, 'template'],
          message: `Only one "${page.template}" page is allowed`,
        });
      }
      templates.set(page.template, pageIndex);

      if (slugs.has(page.slug)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pages', pageIndex, 'slug'],
          message: `Duplicate slug "${page.slug}"`,
        });
      }
      slugs.set(page.slug, pageIndex);

      page.sections.forEach((section, sectionIndex) => {
        if (sectionIds.has(section.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['pages', pageIndex, 'sections', sectionIndex, 'id'],
            message: `Duplicate section id "${section.id}"`,
          });
        }
        sectionIds.set(section.id, page.slug);
      });
    });

    for (const required of ['home', 'products'] as const) {
      if (!templates.has(required)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pages'],
          message: `A "${required}" page is required`,
        });
      }
    }
  });

export type Theme = z.infer<typeof themeSchema>;
export type Navbar = z.infer<typeof navbarSchema>;
export type Footer = z.infer<typeof footerSchema>;
export type Business = z.infer<typeof businessSchema>;
export type Page = z.infer<typeof pageSchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;
/** Shape accepted before normalization (e.g. phone numbers not yet in +92 form). */
export type SiteConfigInput = z.input<typeof siteConfigSchema>;

export function parseSiteConfig(input: unknown): SiteConfig {
  return siteConfigSchema.parse(input);
}

export function safeParseSiteConfig(input: unknown) {
  return siteConfigSchema.safeParse(input);
}
