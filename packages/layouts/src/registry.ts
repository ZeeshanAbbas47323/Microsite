import type { LayoutDefaults } from '@microstore/site-schema';

export interface LayoutMeta {
  id: string;
  name: string;
  description: string;
  /** Path served by apps/web under /layouts. */
  thumbnail: string;
  defaults: LayoutDefaults;
}

/** P0 ships two layouts (FR-3, Phase 1). Add new ones here; ids must never change once used. */
export const LAYOUTS: readonly LayoutMeta[] = [
  {
    id: 'bold-01',
    name: 'Bold',
    description: 'Large hero, strong colors and big product cards.',
    thumbnail: '/layouts/bold-01.png',
    defaults: {
      layoutId: 'bold-01',
      theme: {
        primaryColor: '#1a73e8',
        secondaryColor: '#fbbc04',
        backgroundColor: '#ffffff',
        textColor: '#111111',
        fontFamily: 'Poppins',
        buttonStyle: 'pill',
        borderRadius: 'lg',
      },
      navbar: {
        style: 'split',
        sticky: true,
        backgroundColor: '#111111',
        textColor: '#ffffff',
        showCart: true,
      },
      footer: { style: 'columns' },
    },
  },
  {
    id: 'classic-01',
    name: 'Classic',
    description: 'Clean, centered and calm. Lets products speak.',
    thumbnail: '/layouts/classic-01.png',
    defaults: {
      layoutId: 'classic-01',
      theme: {
        primaryColor: '#0f766e',
        secondaryColor: '#f5f5f4',
        backgroundColor: '#fafaf9',
        textColor: '#1c1917',
        fontFamily: 'Lato',
        buttonStyle: 'rounded',
        borderRadius: 'sm',
      },
      navbar: {
        style: 'centered',
        sticky: false,
        backgroundColor: '#fafaf9',
        textColor: '#1c1917',
        showCart: true,
      },
      footer: { style: 'simple' },
    },
  },
];

export const DEFAULT_LAYOUT_ID = 'bold-01';

export function getLayout(id: string): LayoutMeta | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

export function isKnownLayout(id: string): boolean {
  return getLayout(id) !== undefined;
}
