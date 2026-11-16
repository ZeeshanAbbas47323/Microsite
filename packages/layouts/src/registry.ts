import type { LayoutDefaults } from '@microstore/site-schema';

export interface LayoutMeta {
  id: string;
  name: string;
  description: string;
  /** Path served by apps/web under /layouts. */
  thumbnail: string;
  defaults: LayoutDefaults;
}

/** Layouts 1–2 shipped in Phase 1, 3–5 in Phase 2 (FR-3). Ids must never change once used. */
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
  {
    id: 'minimal-01',
    name: 'Minimal',
    description: 'Lots of white space, light type and sharp edges. Products take centre stage.',
    thumbnail: '/layouts/minimal-01.png',
    defaults: {
      layoutId: 'minimal-01',
      theme: {
        primaryColor: '#111827',
        secondaryColor: '#e5e7eb',
        backgroundColor: '#ffffff',
        textColor: '#111827',
        fontFamily: 'Inter',
        buttonStyle: 'square',
        borderRadius: 'none',
      },
      navbar: {
        style: 'minimal',
        sticky: true,
        backgroundColor: '#ffffff',
        textColor: '#111827',
        showCart: true,
      },
      footer: { style: 'minimal' },
    },
  },
  {
    id: 'boutique-01',
    name: 'Boutique',
    description: 'Elegant serif type, framed photos and soft colors for fashion and gifts.',
    thumbnail: '/layouts/boutique-01.png',
    defaults: {
      layoutId: 'boutique-01',
      theme: {
        primaryColor: '#7c2d12',
        secondaryColor: '#fcd9b8',
        backgroundColor: '#fffaf5',
        textColor: '#292524',
        fontFamily: 'Playfair Display',
        buttonStyle: 'pill',
        borderRadius: 'xl',
      },
      navbar: {
        style: 'centered',
        sticky: false,
        backgroundColor: '#fffaf5',
        textColor: '#292524',
        showCart: true,
      },
      footer: { style: 'columns' },
    },
  },
  {
    id: 'market-01',
    name: 'Market',
    description: 'Bold colors, a compact banner and a dense product grid for larger catalogs.',
    thumbnail: '/layouts/market-01.png',
    defaults: {
      layoutId: 'market-01',
      theme: {
        primaryColor: '#dc2626',
        secondaryColor: '#facc15',
        backgroundColor: '#ffffff',
        textColor: '#18181b',
        fontFamily: 'Nunito',
        buttonStyle: 'rounded',
        borderRadius: 'md',
      },
      navbar: {
        style: 'left',
        sticky: true,
        backgroundColor: '#b91c1c',
        textColor: '#ffffff',
        showCart: true,
      },
      footer: { style: 'columns' },
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
