import {
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  type OnboardingInput,
  type SiteConfig,
} from '../src';

export const FIXED_NOW = new Date('2026-11-12T10:00:00Z');

export function onboardingInput(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    business: {
      name: 'Zara Crafts',
      tagline: 'Handmade with love',
      description: 'Small batch handmade bags and accessories from Lahore.',
      category: 'handmade',
    },
    branding: {
      logoUrl: '',
      primaryColor: '#7c3aed',
      secondaryColor: '#f59e0b',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '0300 1234567',
      whatsapp: '+923001234567',
      email: 'hello@zaracrafts.pk',
      address: '12 Main Boulevard, Gulberg',
      city: 'Lahore',
      social: { facebook: 'https://facebook.com/zaracrafts', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: { title: 'Policies', slug: 'policies' } },
    layoutId: 'bold-01',
    subdomain: 'zara-crafts',
    ...overrides,
  };
}

export function sampleConfig(): SiteConfig {
  const data = onboardingInputSchema.parse(onboardingInput());
  return generateSiteConfig(
    data,
    { layoutId: 'bold-01', ...FALLBACK_LAYOUT_DEFAULTS },
    { now: FIXED_NOW },
  );
}
