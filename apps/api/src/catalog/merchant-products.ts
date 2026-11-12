import {
  isGetorioError,
  type GetorioClient,
  type GetorioProduct,
} from '@microstore/getorio-client';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { SiteRevalidator, StoreService } from '../stores/store-service';
import type { CatalogService } from './catalog-service';

function unavailable(error: unknown): never {
  if (isGetorioError(error) && error.retryable) {
    throw new AppError(
      503,
      'service_unavailable',
      'Getorio is temporarily unavailable. Try again shortly.',
    );
  }
  throw error;
}

function toMerchantProduct(p: GetorioProduct) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    currency: p.currency,
    image: p.images[0] ?? null,
    category: p.category,
    stockQty: p.stockQty,
    active: p.active,
    visible: p.microstore.visible,
    featured: p.microstore.featured,
  };
}

/** FR-6.4: the merchant picks which Getorio products appear on the store. Products live in Getorio. */
export class MerchantProductService {
  constructor(
    private readonly db: Db,
    private readonly getorio: GetorioClient,
    private readonly stores: StoreService,
    private readonly catalog: CatalogService,
    private readonly revalidator: SiteRevalidator,
  ) {}

  async list(
    tenantId: string,
    storeId: string,
    q: { page: number; pageSize: number; search?: string },
  ) {
    await this.stores.get(tenantId, storeId);
    try {
      const res = await this.getorio.listProducts(tenantId, q);
      return { ...res, items: res.items.map(toMerchantProduct) };
    } catch (error) {
      return unavailable(error);
    }
  }

  async setFlags(
    session: Session,
    storeId: string,
    productId: string,
    flags: { visible?: boolean; featured?: boolean },
  ) {
    const tenantId = session.getorioTenantId;
    const store = await this.stores.get(tenantId, storeId);
    let product: GetorioProduct | null;
    try {
      product = await this.getorio.getProduct(tenantId, productId);
      if (!product) throw notFound('Product');
      const next = {
        visible: flags.visible ?? product.microstore.visible,
        featured: flags.featured ?? product.microstore.featured,
      };
      await this.getorio.setProductMicrostoreFlags(tenantId, productId, next);
      product = { ...product, microstore: next };
    } catch (error) {
      return unavailable(error);
    }

    await this.db.storeProduct.upsert({
      where: { storeId_getorioProductId: { storeId, getorioProductId: productId } },
      create: {
        id: newId(),
        storeId,
        getorioTenantId: tenantId,
        getorioProductId: productId,
        visible: product.microstore.visible,
        featured: product.microstore.featured,
      },
      update: { visible: product.microstore.visible, featured: product.microstore.featured },
    });
    await this.catalog.invalidate(tenantId);
    if (store.hostname) await this.revalidator.revalidateStore(storeId, [store.hostname]);
    return toMerchantProduct(product);
  }
}
