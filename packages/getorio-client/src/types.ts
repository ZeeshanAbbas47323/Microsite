import { z } from 'zod';
import { moneySchema } from './money';

// Schemas double as runtime validation for HTTP responses: nothing from Getorio is trusted unchecked.

const id = z.string().min(1).max(64);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const productImageSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  alt: z.string().max(200).default(''),
});

export const productVariantSchema = z.object({
  id,
  sku: z.string().max(64),
  name: z.string().max(200),
  /** e.g. { Size: 'M', Color: 'Black' } */
  options: z.record(z.string().max(40), z.string().max(80)).default({}),
  price: moneySchema,
  stockQty: z.number().int().min(0),
  active: z.boolean(),
});

export const productSchema = z.object({
  id,
  sku: z.string().max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).default(''),
  price: moneySchema,
  compareAtPrice: moneySchema.nullable().default(null),
  currency: currencySchema,
  images: z.array(productImageSchema).max(20).default([]),
  category: z
    .object({ id, name: z.string().max(120) })
    .nullable()
    .default(null),
  variants: z.array(productVariantSchema).max(100).default([]),
  /** Total sellable stock (sum of variants when the product has variants). */
  stockQty: z.number().int().min(0),
  active: z.boolean(),
  microstore: z.object({ visible: z.boolean(), featured: z.boolean() }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type GetorioProductImage = z.infer<typeof productImageSchema>;
export type GetorioVariant = z.infer<typeof productVariantSchema>;
export type GetorioProduct = z.infer<typeof productSchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const paginatedProductsSchema = z.object({
  items: z.array(productSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const MAX_PAGE_SIZE = 100;

export const listProductsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  search: z.string().trim().max(100).optional(),
  categoryId: id.optional(),
  /** Only products that are active AND flagged "Show on Microstore". */
  onlyMicrostore: z.boolean().optional(),
});
export type ListProductsQuery = z.input<typeof listProductsQuerySchema>;

export const stockResponseSchema = z.object({
  stock: z.record(z.string(), z.number().int().min(0)),
});

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

export const orderStatusSchema = z.object({
  getorioOrderId: id,
  status: z.enum(ORDER_STATUSES),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type GetorioOrderStatus = z.infer<typeof orderStatusSchema>;

export const orderItemSchema = z.object({
  productId: id,
  variantId: id.nullable(),
  sku: z.string().max(64),
  name: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  unitPrice: moneySchema,
  lineTotal: moneySchema,
});

export const microstoreOrderPayloadSchema = z.object({
  microstoreOrderRef: z.string().min(1).max(32),
  source: z.literal('microstore'),
  customer: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().regex(/^\+923\d{9}$/),
    email: z.email().nullable(),
  }),
  shipping: z.object({
    address: z.string().min(1).max(250),
    city: z.string().min(1).max(80),
  }),
  items: z.array(orderItemSchema).min(1).max(100),
  subtotal: moneySchema,
  shippingFee: moneySchema,
  total: moneySchema,
  currency: currencySchema,
  paymentMethod: z.literal('cod'),
  notes: z.string().max(500).nullable(),
  placedAt: z.iso.datetime({ offset: true }),
});
export type MicrostoreOrderPayload = z.infer<typeof microstoreOrderPayloadSchema>;

export const createOrderResponseSchema = z.object({ getorioOrderId: id });

export interface MicrostoreFlags {
  visible: boolean;
  featured: boolean;
}
