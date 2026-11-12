import 'server-only';
import {
  PageHeader,
  ProductDetail,
  ProductList,
  Sections,
  SiteShell,
} from '@microstore/layouts/react';
import type { Page } from '@microstore/site-schema';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AddToCart } from '@/components/cart/AddToCart';
import { CartView } from '@/components/cart/CartView';
import { CheckoutForm } from '@/components/cart/CheckoutForm';
import { OrderConfirmation } from '@/components/cart/OrderConfirmation';
import { storefrontUrl } from '@/lib/env';
import { fontFamilyFor } from '@/lib/fonts';
import { getProduct, getProducts, type Mode, type StoreResponse } from './api';
import { buildContext, findPage, hrefBuilder, loadStore, PreviewBanner } from './context';
import { JsonLd } from './json-ld';

export interface StoreParams {
  host: string;
  token?: string;
}
export type Props<Extra = object> = { params: Promise<StoreParams & Extra> };

export function modeOf(params: StoreParams): Mode {
  return {
    host: decodeURIComponent(params.host).toLowerCase(),
    ...(params.token ? { preview: decodeURIComponent(params.token) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Metadata (FR-4.3)

function buildMetadata(
  data: StoreResponse,
  mode: Mode,
  {
    title,
    description,
    path,
    image,
  }: { title: string; description: string; path: string; image?: string },
): Metadata {
  const url = storefrontUrl(data.store.hostname, path);
  const ogImage = image ?? (data.config.business.logoUrl || undefined);
  return {
    title,
    description: description || undefined,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: description || undefined,
      url,
      siteName: data.store.name,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    robots: mode.preview ? { index: false, follow: false } : undefined,
  };
}

function pageTitle(data: StoreResponse, page: Page | undefined, fallback: string) {
  return (
    page?.seo.title ||
    (page ? `${page.title} | ${data.store.name}` : `${fallback} | ${data.store.name}`)
  );
}

export async function homeMetadata({ params }: Props): Promise<Metadata> {
  const mode = modeOf(await params);
  const data = await loadStore(mode);
  const page = findPage(data.config, 'home');
  return buildMetadata(data, mode, {
    title: page?.seo.title || data.store.name,
    description: page?.seo.description || data.config.business.tagline,
    path: '/',
  });
}

export async function contentMetadata({ params }: Props<{ slug: string }>): Promise<Metadata> {
  const p = await params;
  const mode = modeOf(p);
  const data = await loadStore(mode);
  const page = contentPage(data, p.slug);
  return buildMetadata(data, mode, {
    title: pageTitle(data, page, page.title),
    description: page.seo.description,
    path: `/${page.slug}`,
  });
}

export async function productsMetadata({ params }: Props): Promise<Metadata> {
  const mode = modeOf(await params);
  const data = await loadStore(mode);
  const page = findPage(data.config, 'products');
  return buildMetadata(data, mode, {
    title: pageTitle(data, page, 'Products'),
    description: page?.seo.description ?? '',
    path: '/products',
  });
}

export async function productMetadata({ params }: Props<{ id: string }>): Promise<Metadata> {
  const p = await params;
  const mode = modeOf(p);
  const data = await loadStore(mode);
  const product = await getProduct(mode, decodeURIComponent(p.id));
  if (!product) notFound();
  return buildMetadata(data, mode, {
    title: `${product.name} | ${data.store.name}`,
    description: product.description.slice(0, 160),
    path: `/products/${encodeURIComponent(product.id)}`,
    image: product.images[0]?.url,
  });
}

export function systemMetadata(title: string) {
  return async ({ params }: Props): Promise<Metadata> => {
    const mode = modeOf(await params);
    const data = await loadStore(mode);
    return { title: `${title} | ${data.store.name}`, robots: { index: false, follow: false } };
  };
}

// ---------------------------------------------------------------------------------------------
// Pages

async function Shell({
  mode,
  data,
  currentPath,
  page,
  children,
}: {
  mode: Mode;
  data: StoreResponse;
  currentPath: string;
  page?: Page;
  children: (ctx: Awaited<ReturnType<typeof buildContext>>) => ReactNode;
}) {
  const ctx = await buildContext(mode, data, { currentPath, page });
  return (
    <SiteShell
      ctx={ctx}
      fontFamily={fontFamilyFor(data.config.theme.fontFamily)}
      banner={<PreviewBanner mode={mode} />}
    >
      {children(ctx)}
    </SiteShell>
  );
}

export async function HomePage({ params }: Props) {
  const mode = modeOf(await params);
  const data = await loadStore(mode);
  const page = findPage(data.config, 'home');
  const { business } = data.config;
  const url = storefrontUrl(data.store.hostname);
  return (
    <Shell mode={mode} data={data} currentPath="/" page={page}>
      {(ctx) => (
        <>
          <JsonLd
            data={{
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: business.name,
              url,
              ...(business.logoUrl ? { logo: business.logoUrl } : {}),
              ...(business.contact.phone ? { telephone: business.contact.phone } : {}),
              sameAs: Object.values(business.social).filter(Boolean),
            }}
          />
          <Sections ctx={ctx} sections={page?.sections ?? []} />
        </>
      )}
    </Shell>
  );
}

function contentPage(data: StoreResponse, slug: string): Page {
  const page = findPage(data.config, decodeURIComponent(slug));
  if (!page || page.template === 'home' || page.template === 'products') notFound();
  return page;
}

export async function ContentPage({ params }: Props<{ slug: string }>) {
  const p = await params;
  const mode = modeOf(p);
  const data = await loadStore(mode);
  const page = contentPage(data, p.slug);
  const startsWithTitle = page.sections.find((s) => s.visible)?.type === 'hero';
  return (
    <Shell mode={mode} data={data} currentPath={`/${page.slug}`} page={page}>
      {(ctx) => (
        <>
          {startsWithTitle ? null : <PageHeader ctx={ctx} title={page.title} />}
          <Sections ctx={ctx} sections={page.sections} />
        </>
      )}
    </Shell>
  );
}

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
  ['name', 'Name'],
] as const;
const PAGE_SIZE = 24;

export type ProductsProps = Props & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function ProductsPage({ params, searchParams }: ProductsProps) {
  const mode = modeOf(await params);
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const search = one('q')?.slice(0, 100) ?? '';
  const category = one('category') ?? '';
  const sort = SORTS.some(([k]) => k === one('sort')) ? (one('sort') as string) : 'featured';
  const pageNo = Math.max(1, Math.min(1000, Number(one('page')) || 1));

  const data = await loadStore(mode);
  const page = findPage(data.config, 'products');
  const products = await getProducts(mode, {
    page: pageNo,
    pageSize: PAGE_SIZE,
    search,
    category,
    sort,
  });
  const pages = Math.max(1, Math.ceil(products.total / PAGE_SIZE));
  const href = hrefBuilder(mode);
  const qs = (overrides: Record<string, string | number>) => {
    const q = new URLSearchParams();
    const merged = { q: search, category, sort, page: pageNo, ...overrides };
    for (const [k, v] of Object.entries(merged))
      if (v && !(k === 'sort' && v === 'featured') && !(k === 'page' && v === 1))
        q.set(k, String(v));
    const s = q.toString();
    return href(`/products${s ? `?${s}` : ''}`);
  };
  const extraSections = (page?.sections ?? []).filter((s) => s.type !== 'productGrid');

  return (
    <Shell mode={mode} data={data} currentPath="/products" page={page}>
      {(ctx) => (
        <>
          <Sections ctx={ctx} sections={extraSections} />
          <PageHeader ctx={ctx} title={page?.title ?? 'Products'} />
          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6">
            <form
              action="/products"
              method="get"
              role="search"
              className="flex flex-col gap-3 sm:flex-row"
            >
              {mode.preview ? <input type="hidden" name="preview" value={mode.preview} /> : null}
              {category ? <input type="hidden" name="category" value={category} /> : null}
              <label className="flex-1">
                <span className="sr-only">Search products</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={search}
                  placeholder="Search products"
                  className="h-11 w-full rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="shrink-0">Sort</span>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="h-11 rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3"
                >
                  {SORTS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="h-11 rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] px-5 text-sm font-semibold text-[var(--ms-on-primary)]"
              >
                Apply
              </button>
            </form>
            {products.categories.length > 1 ? (
              <nav aria-label="Categories">
                <ul className="flex flex-wrap gap-2 text-sm">
                  {[{ id: '', name: 'All' }, ...products.categories].map((c) => (
                    <li key={c.id || 'all'}>
                      <Link
                        href={qs({ category: c.id, page: 1 })}
                        className={`inline-flex rounded-full border px-4 py-1.5 ${category === c.id ? 'border-[var(--ms-primary)] bg-[var(--ms-primary)] text-[var(--ms-on-primary)]' : 'border-[var(--ms-border)]'}`}
                        {...(category === c.id ? { 'aria-current': 'page' as const } : {})}
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {products.stale ? (
              <p className="text-sm text-[var(--ms-muted)]">
                Some prices and stock may be slightly out of date.
              </p>
            ) : null}
            {products.items.length ? (
              <ProductList ctx={ctx} products={products.items} priorityCount={4} />
            ) : (
              <p className="py-16 text-center text-[var(--ms-muted)]">No products found.</p>
            )}
            {pages > 1 ? (
              <nav
                aria-label="Pagination"
                className="flex items-center justify-center gap-4 pt-4 text-sm"
              >
                {pageNo > 1 ? (
                  <Link href={qs({ page: pageNo - 1 })} className="underline">
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span>
                  Page {pageNo} of {pages}
                </span>
                {pageNo < pages ? (
                  <Link href={qs({ page: pageNo + 1 })} className="underline">
                    Next
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </div>
        </>
      )}
    </Shell>
  );
}

export async function ProductPage({ params }: Props<{ id: string }>) {
  const p = await params;
  const mode = modeOf(p);
  const data = await loadStore(mode);
  const product = await getProduct(mode, decodeURIComponent(p.id));
  if (!product) notFound();
  const href = hrefBuilder(mode);
  const base = storefrontUrl(data.store.hostname);
  const url = storefrontUrl(data.store.hostname, `/products/${encodeURIComponent(product.id)}`);
  return (
    <Shell mode={mode} data={data} currentPath="/products">
      {(ctx) => (
        <>
          <JsonLd
            data={[
              {
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: product.name,
                sku: product.sku,
                description: product.description,
                image: product.images.map((i) => i.url),
                url,
                offers: {
                  '@type': 'Offer',
                  price: product.price,
                  priceCurrency: product.currency,
                  availability: product.inStock
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                  url,
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Home', item: base },
                  { '@type': 'ListItem', position: 2, name: 'Products', item: `${base}/products` },
                  { '@type': 'ListItem', position: 3, name: product.name, item: url },
                ],
              },
            ]}
          />
          <ProductDetail
            ctx={ctx}
            product={product}
            purchase={<AddToCart product={product} cartHref={href('/cart')} />}
          />
        </>
      )}
    </Shell>
  );
}

export async function CartPage({ params }: Props) {
  const mode = modeOf(await params);
  const data = await loadStore(mode);
  const href = hrefBuilder(mode);
  return (
    <Shell mode={mode} data={data} currentPath="/cart">
      {(ctx) => (
        <>
          <PageHeader ctx={ctx} title="Your cart" />
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
            <CartView
              rules={data.store.settings}
              currency={data.store.currency}
              checkoutHref={href('/checkout')}
              productsHref={href('/products')}
            />
          </div>
        </>
      )}
    </Shell>
  );
}

export async function CheckoutPage({ params }: Props) {
  const mode = modeOf(await params);
  const data = await loadStore(mode);
  const href = hrefBuilder(mode);
  return (
    <Shell mode={mode} data={data} currentPath="/checkout">
      {(ctx) => (
        <>
          <PageHeader ctx={ctx} title="Checkout" />
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
            {mode.preview ? (
              <p className="py-10 text-center text-[var(--ms-muted)]">
                Checkout is disabled in preview. Publish the store to take orders.
              </p>
            ) : (
              <CheckoutForm
                rules={data.store.settings}
                currency={data.store.currency}
                orderHref={href('/order/{ref}')}
                cartHref={href('/cart')}
              />
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

export async function OrderPage({ params }: Props<{ ref: string }>) {
  const p = await params;
  const mode = modeOf(p);
  const data = await loadStore(mode);
  const ref = decodeURIComponent(p.ref);
  if (!/^MS-[A-Z0-9]{4,12}$/.test(ref)) notFound();
  return (
    <Shell mode={mode} data={data} currentPath="/order">
      {() => (
        <div className="px-4">
          <OrderConfirmation orderRef={ref} homeHref={hrefBuilder(mode)('/')} />
        </div>
      )}
    </Shell>
  );
}
