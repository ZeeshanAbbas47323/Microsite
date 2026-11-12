import { formatMoney } from './theme';
import type { PublicProduct, RenderContext } from './types';
import { variantFor } from './variants';

export function ProductCard({
  ctx,
  product,
  priority = false,
}: {
  ctx: RenderContext;
  product: PublicProduct;
  priority?: boolean;
}) {
  const v = variantFor(ctx.config.layoutId);
  const image = product.images[0];
  const onSale =
    product.compareAtPrice !== null && Number(product.compareAtPrice) > Number(product.price);
  return (
    <ctx.Link href={ctx.href(`/products/${encodeURIComponent(product.id)}`)} className={v.card}>
      <div className="relative bg-[var(--ms-border)]">
        {image ? (
          <ctx.Image
            src={image.url}
            alt={image.alt || product.name}
            width={600}
            height={600}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className={v.cardImage}
            priority={priority}
          />
        ) : (
          <div className={`${v.cardImage} aspect-square`} aria-hidden="true" />
        )}
        {!product.inStock ? (
          <span className="absolute start-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold text-white">
            Out of stock
          </span>
        ) : onSale ? (
          <span className="absolute start-2 top-2 rounded-full bg-[var(--ms-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--ms-on-secondary)]">
            Sale
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-semibold sm:text-base">{product.name}</h3>
        <p className="mt-auto flex items-baseline gap-2 text-sm">
          <span className="font-bold">{formatMoney(product.price, product.currency)}</span>
          {onSale ? (
            <s className="text-xs text-[var(--ms-muted)]">
              {formatMoney(product.compareAtPrice as string, product.currency)}
            </s>
          ) : null}
        </p>
      </div>
    </ctx.Link>
  );
}

export function ProductList({
  ctx,
  products,
  priorityCount = 0,
}: {
  ctx: RenderContext;
  products: PublicProduct[];
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex [&>a]:w-full">
          <ProductCard ctx={ctx} product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
