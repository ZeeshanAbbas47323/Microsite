import type { ReactNode } from 'react';
import { Icon } from './icons';
import { ProductList } from './ProductCard';
import { formatMoney } from './theme';
import type { PublicProduct, RenderContext } from './types';
import { variantFor } from './variants';

/** Product detail system page. `purchase` is the app's interactive add-to-cart control. */
export function ProductDetail({
  ctx,
  product,
  purchase,
  related = [],
}: {
  ctx: RenderContext;
  product: PublicProduct;
  purchase: ReactNode;
  /** Other products to suggest below (same category first). */
  related?: PublicProduct[];
}) {
  const v = variantFor(ctx.config.layoutId);
  const [main, ...rest] = product.images;
  const onSale =
    product.compareAtPrice !== null && Number(product.compareAtPrice) > Number(product.price);
  const saving = onSale
    ? formatMoney(String(Number(product.compareAtPrice) - Number(product.price)), product.currency)
    : null;
  const hasWhatsapp =
    ctx.store.settings.whatsappButton && Boolean(ctx.config.business.contact.whatsapp);
  const promises = [
    { icon: 'cash' as const, title: 'Cash on delivery', text: 'Pay when your order arrives.' },
    {
      icon: 'truck' as const,
      title: 'Delivery across Pakistan',
      text: 'The charge for your city is shown at checkout.',
    },
    {
      icon: 'clock' as const,
      title: 'Track your order',
      text: 'Follow your order with its number and your phone.',
    },
  ];

  return (
    <>
      <article
        className={`${v.container} grid gap-10 py-8 md:grid-cols-2 md:py-12 lg:grid-cols-[7fr_5fr] lg:gap-14`}
      >
        <div className="space-y-3 md:sticky md:top-24 md:self-start">
          {main ? (
            <ctx.Image
              src={main.url}
              alt={main.alt || product.name}
              width={900}
              height={900}
              sizes="(min-width: 1024px) 55vw, (min-width: 768px) 50vw, 100vw"
              priority
              className="aspect-square w-full rounded-[var(--ms-radius)] bg-[var(--ms-surface)] object-cover"
            />
          ) : (
            <div
              className="aspect-square w-full rounded-[var(--ms-radius)] bg-[var(--ms-border)]"
              aria-hidden="true"
            />
          )}
          {rest.length ? (
            <ul className="grid grid-cols-4 gap-3">
              {rest.slice(0, 8).map((img) => (
                <li key={img.url}>
                  <ctx.Image
                    src={img.url}
                    alt={img.alt || product.name}
                    width={200}
                    height={200}
                    sizes="12vw"
                    className="aspect-square w-full rounded-[var(--ms-radius)] object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <nav aria-label="Breadcrumb" className="text-sm text-[var(--ms-muted)]">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <ctx.Link href={ctx.href('/')} className="hover:underline">
                  Home
                </ctx.Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <ctx.Link href={ctx.href('/products')} className="hover:underline">
                  Products
                </ctx.Link>
              </li>
              {product.category ? (
                <>
                  <li aria-hidden="true">/</li>
                  <li>
                    <ctx.Link
                      href={ctx.href(
                        `/products?category=${encodeURIComponent(product.category.id)}`,
                      )}
                      className="hover:underline"
                    >
                      {product.category.name}
                    </ctx.Link>
                  </li>
                </>
              ) : null}
            </ol>
          </nav>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
            <p className="flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-bold">
                {formatMoney(product.price, product.currency)}
              </span>
              {onSale ? (
                <>
                  <s className="text-lg text-[var(--ms-muted)]">
                    {formatMoney(product.compareAtPrice as string, product.currency)}
                  </s>
                  <span className="rounded-full bg-[var(--ms-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ms-on-secondary)]">
                    Save {saving}
                  </span>
                </>
              ) : null}
            </p>
            <p
              className={`flex items-center gap-2 text-sm font-semibold ${product.inStock ? 'text-green-700' : 'text-red-700'}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${product.inStock ? 'bg-green-600' : 'bg-red-600'}`}
                aria-hidden="true"
              />
              {product.inStock ? 'In stock, ready to ship' : 'Out of stock'}
            </p>
          </div>

          {purchase}

          <ul className="divide-y divide-[var(--ms-border)] rounded-[var(--ms-radius)] border border-[var(--ms-border)]">
            {promises.map((p) => (
              <li key={p.title} className="flex items-start gap-3 p-4">
                <span className="text-[var(--ms-primary)]">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <div className="text-sm">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-[var(--ms-muted)]">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>

          {product.description ? (
            <details open className="group border-t border-[var(--ms-border)] pt-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
                Description
                <span className="text-xl transition group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-[var(--ms-muted)]">
                {product.description}
              </p>
            </details>
          ) : null}
          {hasWhatsapp ? (
            <p className="text-sm text-[var(--ms-muted)]">
              Questions about this product? Tap the WhatsApp button to ask us.
            </p>
          ) : null}
        </div>
      </article>

      {related.length ? (
        <section className={`${v.section} border-t border-[var(--ms-border)]`}>
          <div className={`${v.container} space-y-8`}>
            <h2 className={v.heading}>You may also like</h2>
            <ProductList ctx={ctx} products={related} />
          </div>
        </section>
      ) : null}
    </>
  );
}
