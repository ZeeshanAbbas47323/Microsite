import type { ComponentType, ReactNode } from 'react';
import type { Page, Section, SiteConfig } from '@microstore/site-schema';

/** Product as returned by the public API (`GET /public/products`). */
export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  images: { url: string; alt: string }[];
  category: { id: string; name: string } | null;
  featured: boolean;
  inStock: boolean;
  variants: {
    id: string;
    name: string;
    options: Record<string, string>;
    price: string;
    inStock: boolean;
  }[];
}

export interface StoreInfo {
  name: string;
  hostname: string;
  currency: string;
  settings: {
    whatsappButton: boolean;
    rtl: boolean;
    shippingFlatFee: string;
    freeShippingThreshold: string | null;
  };
}

export interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
  'aria-label'?: string;
}

export interface ImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

/**
 * Everything a layout needs to render. Layouts only read the config and this context; they never
 * hold merchant data and do not depend on a framework (the app injects Link and Image).
 */
export interface RenderContext {
  config: SiteConfig;
  store: StoreInfo;
  /** Builds an internal URL (keeps the preview token when previewing). */
  href: (path: string) => string;
  Link: ComponentType<LinkProps>;
  Image: ComponentType<ImageProps>;
  /** Products already loaded for each productGrid section, by section id. */
  sectionProducts: Record<string, PublicProduct[]>;
  /** Current path, for aria-current in the navbar. */
  currentPath: string;
  /** Interactive cart link (client component) rendered in the navbar. */
  cartSlot?: ReactNode;
}

export type { Page, Section, SiteConfig };
