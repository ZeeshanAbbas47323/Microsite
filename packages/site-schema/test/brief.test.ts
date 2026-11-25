import { describe, expect, it } from 'vitest';
import {
  applyStoreBrief,
  FALLBACK_LAYOUT_DEFAULTS,
  siteConfigSchema,
  storeBriefSchema,
  type StoreBrief,
} from '../src';
import { sampleConfig } from './fixtures';

export const SAMPLE_BRIEF = {
  business: {
    tagline: 'Handmade leather, made to last',
    description: 'Hand-stitched leather bags and wallets from Lahore.',
    category: 'handmade',
  },
  layoutId: 'classic-01',
  theme: {
    primaryColor: '#7c2d12',
    secondaryColor: '#fde68a',
    backgroundColor: '#fffaf5',
    textColor: '#fffaf6', // unreadable on this background: must be fixed
    fontFamily: 'Playfair Display',
    buttonStyle: 'square',
    borderRadius: 'sm',
  },
  navbar: { backgroundColor: '#1c1917', textColor: '#ffffff' },
  hero: {
    eyebrow: 'Made in Lahore',
    title: 'Leather that <b>ages</b> beautifully',
    subtitle: 'Bags and wallets stitched by hand.',
    ctaLabel: 'Shop the collection',
  },
  features: [
    { icon: 'cash', title: 'Cash on delivery', text: 'Pay when it arrives.' },
    { icon: 'truck', title: 'Delivery across Pakistan', text: 'Charges shown at checkout.' },
    { icon: 'heart', title: 'Made by hand', text: 'Every piece is stitched by hand.' },
  ],
  featuredTitle: 'Bestsellers',
  banner: 'Free gift wrapping on every order',
  about: { title: 'Our workshop', body: 'We cut and stitch every bag in our Lahore workshop.' },
  story: 'It started with one bag for a friend.<script>alert(1)</script>',
  faq: [
    { question: 'How do I pay?', answer: 'Cash on delivery.' },
    { question: 'Do you deliver to my city?', answer: 'Yes, across Pakistan.' },
    { question: 'Can I track my order?', answer: 'Yes, on the Track your order page.' },
  ],
  seo: {
    title: 'Zara Crafts | Handmade leather bags',
    description: 'Hand-stitched leather from Lahore.',
  },
  footerAbout: 'Handmade leather goods from Lahore.',
};

const layout = { layoutId: 'classic-01', ...FALLBACK_LAYOUT_DEFAULTS };

describe('magic store brief', () => {
  it('turns a brief into a complete, valid store design', () => {
    const current = sampleConfig();
    const brief = storeBriefSchema.parse(SAMPLE_BRIEF) as StoreBrief;
    const next = applyStoreBrief(current, brief, layout);
    expect(siteConfigSchema.safeParse(next).success).toBe(true);
    const home = next.pages.find((p) => p.slug === 'home');
    const hero = home?.sections.find((s) => s.type === 'hero');
    expect(hero?.props).toMatchObject({
      eyebrow: 'Made in Lahore',
      ctaLabel: 'Shop the collection',
    });
    // Markup never survives
    expect(JSON.stringify(next)).not.toMatch(/<b>|<script>/);
    expect(home?.seo.title).toBe('Zara Crafts | Handmade leather bags');
    expect(next.footer.about).toBe('Handmade leather goods from Lahore.');
    expect(next.layoutId).toBe('classic-01');
    expect(next.theme.fontFamily).toBe('Playfair Display');
  });

  it('keeps the store identity and fixes unreadable text colors', () => {
    const current = sampleConfig();
    const next = applyStoreBrief(
      current,
      storeBriefSchema.parse(SAMPLE_BRIEF) as StoreBrief,
      layout,
    );
    expect(next.business.name).toBe(current.business.name);
    expect(next.business.contact).toEqual(current.business.contact);
    expect(next.footer.text).toBe(current.footer.text);
    expect(next.theme.textColor).toBe('#111111');
    expect(next.navbar.textColor).toBe('#ffffff');
  });

  it('uses an Urdu font and Urdu template labels for Urdu stores', () => {
    const next = applyStoreBrief(
      sampleConfig(),
      storeBriefSchema.parse(SAMPLE_BRIEF) as StoreBrief,
      layout,
      {
        language: 'ur',
      },
    );
    expect(next.theme.fontFamily).toBe('Noto Nastaliq Urdu');
    expect(JSON.stringify(next)).toContain('ہماری کہانی');
    expect(JSON.stringify(next.pages[0])).not.toContain('"New arrivals"');
  });

  it('rejects briefs outside the fixed choices', () => {
    for (const bad of [
      { ...SAMPLE_BRIEF, theme: { ...SAMPLE_BRIEF.theme, fontFamily: 'Comic Sans' } },
      { ...SAMPLE_BRIEF, features: [] },
      { ...SAMPLE_BRIEF, theme: { ...SAMPLE_BRIEF.theme, primaryColor: 'red' } },
      { ...SAMPLE_BRIEF, business: { ...SAMPLE_BRIEF.business, category: 'weapons' } },
    ]) {
      expect(storeBriefSchema.safeParse(bad).success).toBe(false);
    }
  });
});
