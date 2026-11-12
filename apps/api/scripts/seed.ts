/**
 * Seeds a sample merchant and a published store (requirements §13.7).
 *
 *   pnpm --filter @microstore/api db:seed
 *
 * Idempotent: an existing store for the sample tenant is left untouched. Sample products come from
 * the mock Getorio client (every tenant gets the same 12 PKR products).
 */
import { SAMPLE_TENANT_ID } from '@microstore/getorio-client';
import type { OnboardingInput } from '@microstore/site-schema';
import type { Session } from '../src/auth/sessions';
import { upsertMerchant } from '../src/auth/merchants';
import { createDb } from '../src/db';
import { loadEnv } from '../src/env';
import { StoreService } from '../src/stores/store-service';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

const db = createDb(env.DATABASE_URL);
const stores = new StoreService(db, {
  rootDomain: env.ROOT_DOMAIN,
  storefrontUrlTemplate: env.STOREFRONT_URL_TEMPLATE,
});
const tenantId = process.argv[2] ?? SAMPLE_TENANT_ID;
const userId = 'demo-owner';

const input: OnboardingInput = {
  business: {
    name: 'Demo Bazaar',
    tagline: 'Handmade goods from Lahore',
    description:
      'Bags, footwear and home decor made by local artisans. Cash on delivery across Pakistan.',
    category: 'handmade',
  },
  branding: {
    logoUrl: '',
    primaryColor: '#0f766e',
    secondaryColor: '#f59e0b',
    fontFamily: 'Poppins',
  },
  contact: {
    phone: '03001234567',
    whatsapp: '03001234567',
    email: 'hello@demo-bazaar.test',
    address: '12 Main Boulevard, Gulberg',
    city: 'Lahore',
    social: {
      facebook: 'https://facebook.com/demobazaar',
      instagram: 'https://instagram.com/demobazaar',
      tiktok: '',
    },
  },
  pages: { about: true, contact: true, custom: { title: 'Shipping & returns', slug: 'shipping' } },
  layoutId: 'bold-01',
  subdomain: 'demo-bazaar',
};

try {
  const merchant = await upsertMerchant(db, {
    getorioTenantId: tenantId,
    getorioUserId: userId,
    role: 'owner',
    exp: 0,
  });
  const session: Session = {
    id: 'seed',
    merchantId: merchant.id,
    getorioUserId: userId,
    getorioTenantId: tenantId,
    role: 'owner',
    csrfToken: '',
    createdAt: Date.now(),
    rotatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };

  let store = await stores.findForTenant(tenantId);
  if (store) {
    console.log(`Tenant ${tenantId} already has a store ("${store.name}"), leaving it as is.`);
  } else {
    const free = await stores.checkSubdomain(input.subdomain);
    store = await stores.create(session, {
      ...input,
      subdomain: free.available ? input.subdomain : `demo-bazaar-${Date.now().toString(36)}`,
    });
    store = await stores.publish(session, store.id);
    console.log(`Created and published "${store.name}".`);
  }
  console.log(`Storefront: ${store.url}`);
  console.log(`Sign in:    pnpm --filter @microstore/api dev:sso-link ${tenantId} ${userId} owner`);
} finally {
  await db.$disconnect();
}
