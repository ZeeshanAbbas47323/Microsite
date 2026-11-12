import type { ReactNode } from 'react';
import { formatMoney } from './theme';
import type { PublicProduct, RenderContext } from './types';

/** Product detail system page. `purchase` is the app's interactive add-to-cart control. */
export function ProductDetail({
  ctx,
  product,
  purchase,
}: {
  ctx: RenderContext;
  product: PublicProduct;
  purchase: ReactNode;
}) {
  const [main, ...rest] = product.images;
  const onSale =
    product.compareAtPrice !== null && Number(product.compareAtPrice) > Number(product.price);
  return (
    <article className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-2">
      <div className="space-y-3">
        {main ? (
          <ctx.Image
            src={main.url}
            alt={main.alt || product.name}
            width={900}
            height={900}
            sizes="(min-width: 768px) 50vw, 100vw"
            priority
            className="aspect-square w-full rounded-[var(--ms-radius)] object-cover"
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
      <div className="flex flex-col gap-5">
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--ms-muted)]">
          <ol className="flex flex-wrap gap-1">
            <li>
              <ctx.Link href={ctx.href('/products')} className="hover:underline">
                Products
              </ctx.Link>
            </li>
            {product.category ? <li aria-hidden="true">/</li> : null}
            {product.category ? <li>{product.category.name}</li> : null}
          </ol>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
        <p className="flex items-baseline gap-3 text-2xl">
          <span className="font-bold">{formatMoney(product.price, product.currency)}</span>
          {onSale ? (
            <s className="text-lg text-[var(--ms-muted)]">
              {formatMoney(product.compareAtPrice as string, product.currency)}
            </s>
          ) : null}
        </p>
        <p
          className={`text-sm font-semibold ${product.inStock ? 'text-green-700' : 'text-red-700'}`}
        >
          {product.inStock ? 'In stock' : 'Out of stock'}
        </p>
        {purchase}
        {product.description ? (
          <div className="border-t border-[var(--ms-border)] pt-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--ms-muted)]">
              Description
            </h2>
            <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
          </div>
        ) : null}
        <p className="text-sm text-[var(--ms-muted)]">Cash on delivery available.</p>
      </div>
    </article>
  );
}
