import 'server-only';
import type {
  ImageProps,
  LinkProps,
  PublicProduct,
  RenderContext,
} from '@microstore/layouts/react';
import type { Page, SiteConfig } from '@microstore/site-schema';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CartLink } from '@/components/cart/CartLink';
import { getProducts, getStore, StorefrontApiError, type Mode, type StoreResponse } from './api';
import { notFound } from 'next/navigation';

function NextLink({ href, className, children, ...rest }: LinkProps) {
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

function NextImage({ src, alt, width, height, sizes, priority, className }: ImageProps) {
  // Bundled placeholders are local; remote images go through the optimizer (AVIF/WebP, FR-4.4).
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}

/** Loads the store for a request, mapping "not found / unpublished / suspended" to a 404 (FR-4.6). */
export async function loadStore(mode: Mode): Promise<StoreResponse> {
  try {
    return await getStore(mode);
  } catch (error) {
    if (error instanceof StorefrontApiError && [404, 503].includes(error.status)) notFound();
    throw error;
  }
}

export function hrefBuilder(mode: Mode) {
  return (path: string) => {
    if (!mode.preview) return path;
    const [base, hash] = path.split('#');
    const sep = (base ?? '').includes('?') ? '&' : '?';
    return `${base}${sep}preview=${encodeURIComponent(mode.preview)}${hash ? `#${hash}` : ''}`;
  };
}

/** Fetches the products each productGrid section of a page needs. */
async function loadSectionProducts(mode: Mode, page: Page | undefined) {
  const result: Record<string, PublicProduct[]> = {};
  if (!page) return result;
  await Promise.all(
    page.sections
      .filter((s) => s.visible && s.type === 'productGrid')
      .map(async (s) => {
        if (s.type !== 'productGrid') return;
        const { limit, source, categoryId } = s.props;
        const res = await getProducts(mode, {
          pageSize: Math.min(limit, 48),
          featured: source === 'featured',
          category: source === 'category' ? categoryId : undefined,
          sort: source === 'latest' ? 'newest' : 'featured',
        });
        result[s.id] = res.items;
      }),
  );
  return result;
}

export async function buildContext(
  mode: Mode,
  data: StoreResponse,
  { currentPath, page }: { currentPath: string; page?: Page },
): Promise<RenderContext> {
  const href = hrefBuilder(mode);
  return {
    config: data.config,
    store: data.store,
    href,
    Link: NextLink,
    Image: NextImage,
    sectionProducts: await loadSectionProducts(mode, page),
    currentPath,
    cartSlot: <CartLink href={href('/cart')} />,
  };
}

export function findPage(config: SiteConfig, slug: string): Page | undefined {
  return config.pages.find((p) => p.slug === slug);
}

export function PreviewBanner({ mode }: { mode: Mode }): ReactNode {
  if (!mode.preview) return null;
  return (
    <div
      role="status"
      className="bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black"
    >
      Preview of your unpublished changes. Customers do not see this yet.
    </div>
  );
}
