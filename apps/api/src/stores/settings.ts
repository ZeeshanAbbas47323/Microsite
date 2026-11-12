import { moneySchema } from '@microstore/getorio-client';
import { z } from 'zod';

/** Per-store settings kept in `stores.settings` (JSON). Values here are never filtered on in SQL. */
export const storeSettingsSchema = z.strictObject({
  shippingFlatFee: moneySchema,
  /** Orders at or above this subtotal ship free. Null disables free shipping. */
  freeShippingThreshold: moneySchema.nullable(),
  notifications: z.strictObject({
    /** Email the customer a confirmation when they gave an address. */
    customerEmail: z.boolean(),
    /** SMS/WhatsApp hook (adapter disabled by default, FR-5.8). */
    customerMessage: z.boolean(),
  }),
  whatsappButton: z.boolean(),
  rtl: z.boolean(),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  shippingFlatFee: '0.00',
  freeShippingThreshold: null,
  notifications: { customerEmail: true, customerMessage: false },
  whatsappButton: true,
  rtl: false,
};

/** Partial update accepted by `PATCH /stores/:id/settings`. */
export const storeSettingsPatchSchema = z.strictObject({
  shippingFlatFee: moneySchema.optional(),
  freeShippingThreshold: moneySchema.nullable().optional(),
  notifications: storeSettingsSchema.shape.notifications.partial().optional(),
  whatsappButton: z.boolean().optional(),
  rtl: z.boolean().optional(),
  /** Changing it keeps the old subdomain redirecting for 30 days (FR-6.6). */
  subdomain: z.string().optional(),
});
export type StoreSettingsPatch = z.infer<typeof storeSettingsPatchSchema>;

export function mergeSettings(current: StoreSettings, patch: StoreSettingsPatch): StoreSettings {
  const { subdomain: _subdomain, notifications, ...rest } = patch;
  return storeSettingsSchema.parse({
    ...current,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    notifications: { ...current.notifications, ...notifications },
  });
}
