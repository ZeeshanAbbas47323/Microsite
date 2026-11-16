import { describe, expect, it } from 'vitest';
import { createSection, SECTION_TYPES, sectionSchema } from '../src';

describe('createSection', () => {
  it('creates a valid section of every type', () => {
    for (const type of SECTION_TYPES) {
      const section = createSection(type, []);
      expect(section.type).toBe(type);
      expect(sectionSchema.safeParse(section).success, type).toBe(true);
    }
  });

  it('picks an id not used on the page and never shares props objects', () => {
    expect(createSection('faq', ['faq', 'faq-2']).id).toBe('faq-3');
    const a = createSection('faq', []);
    const b = createSection('faq', []);
    expect(a.props).not.toBe(b.props);
  });
});
