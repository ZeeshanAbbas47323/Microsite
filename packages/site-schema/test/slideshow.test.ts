import { describe, expect, it } from 'vitest';
import {
  createSection,
  MAX_SLIDES,
  safeParseSiteConfig,
  sectionSchema,
  slideSchema,
  validateCommandPatch,
  type SiteConfig,
} from '../src';
import { sampleConfig } from './fixtures';

const slideshow = () => createSection('slideshow', []);

function withSlideshow(): SiteConfig {
  const c = sampleConfig();
  const home = c.pages.find((p) => p.template === 'home');
  home?.sections.unshift(slideshow());
  return c;
}

describe('slideshow section', () => {
  it('starts with three text slides that pass the schema', () => {
    const s = slideshow();
    expect(sectionSchema.safeParse(s).success).toBe(true);
    if (s.type !== 'slideshow') throw new Error('wrong type');
    expect(s.props.slides).toHaveLength(3);
    expect(s.props.autoplay).toBe(true);
  });

  it('accepts image-only, text-only and button-less slides, but not empty ones', () => {
    expect(slideSchema.safeParse({ imageUrl: 'https://img.test/a.jpg' }).success).toBe(true);
    expect(slideSchema.safeParse({ title: 'Just words' }).success).toBe(true);
    expect(slideSchema.safeParse({ text: 'No button', ctaLabel: '' }).success).toBe(true);
    expect(slideSchema.safeParse({ ctaLabel: 'Shop', ctaLink: '/products' }).success).toBe(false);
  });

  it('fills in defaults for options and rejects unsafe or oversized input', () => {
    const parsed = sectionSchema.safeParse({
      id: 'slides',
      type: 'slideshow',
      visible: true,
      props: { slides: [{ title: 'Hi' }] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'slideshow') {
      expect(parsed.data.props.style).toBe('overlay');
      expect(parsed.data.props.interval).toBe(5);
      expect(parsed.data.props.slides[0]?.align).toBe('center');
    }
    const bad = (props: Record<string, unknown>) =>
      sectionSchema.safeParse({ id: 's', type: 'slideshow', visible: true, props }).success;
    expect(bad({ slides: [] })).toBe(false);
    expect(bad({ slides: Array.from({ length: MAX_SLIDES + 1 }, () => ({ title: 'x' })) })).toBe(
      false,
    );
    expect(bad({ slides: [{ title: 'x', ctaLink: 'javascript:alert(1)' }] })).toBe(false);
    expect(bad({ slides: [{ title: 'x' }], interval: 4 })).toBe(false);
    expect(bad({ slides: [{ title: 'x' }], perView: 6 })).toBe(false);
    expect(bad({ slides: [{ title: 'x' }], overlay: 95 })).toBe(false);
  });

  it('fits in a full site config', () => {
    expect(safeParseSiteConfig(withSlideshow()).success).toBe(true);
  });

  it('lets the assistant rewrite slide texts but not links or images', () => {
    const config = withSlideshow();
    const page = config.pages.findIndex((p) => p.template === 'home');
    const base = `/pages/${page}/sections/0/props/slides/0`;
    const ok = validateCommandPatch(config, [
      { op: 'replace', path: `${base}/title`, value: 'Eid collection is here' },
    ]);
    expect(ok.ok).toBe(true);
    for (const [key, value] of [
      ['ctaLink', 'https://evil.test'],
      ['imageUrl', 'https://evil.test/x.png'],
    ] as const) {
      expect(
        validateCommandPatch(config, [{ op: 'replace', path: `${base}/${key}`, value }]).ok,
      ).toBe(false);
    }
  });
});
