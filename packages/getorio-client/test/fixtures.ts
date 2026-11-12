import type { MicrostoreOrderPayload } from '../src';

export function orderPayload(
  overrides: Partial<MicrostoreOrderPayload> = {},
): MicrostoreOrderPayload {
  return {
    microstoreOrderRef: 'MS-7K2P9Q',
    source: 'microstore',
    customer: { name: 'Ayesha Khan', phone: '+923001234567', email: null },
    shipping: { address: 'House 5, Street 2, DHA Phase 5', city: 'Karachi' },
    items: [
      {
        productId: 'p-1001',
        variantId: null,
        sku: 'BAG-TOTE-01',
        name: 'Leather Tote Bag',
        qty: 2,
        unitPrice: '4500.00',
        lineTotal: '9000.00',
      },
      {
        productId: 'p-1004',
        variantId: 'v-1004-7',
        sku: 'FW-KHUSSA-01-7',
        name: 'Classic Khussa - Size 7',
        qty: 1,
        unitPrice: '3200.00',
        lineTotal: '3200.00',
      },
    ],
    subtotal: '12200.00',
    shippingFee: '250.00',
    total: '12450.00',
    currency: 'PKR',
    paymentMethod: 'cod',
    notes: null,
    placedAt: '2026-11-12T10:00:00.000Z',
    ...overrides,
  };
}

/** Array access that fails loudly instead of needing a non-null assertion. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item at index ${index}`);
  return item;
}
