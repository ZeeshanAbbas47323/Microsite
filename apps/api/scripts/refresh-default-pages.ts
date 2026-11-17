/**
 * Dev only: gives a store's Home, About and Contact pages the latest default sections (other
 * pages, theme and business details stay as they are). Saves to the draft as a normal revision,
 * so it can be undone from version history.
 *
 *   pnpm --filter @microstore/api dev:refresh-pages [tenantId]
 */
import { getLayout } from '@microstore/layouts';
import {
  generateSiteConfig,
  migrateSiteConfig,
  type BusinessCategory,
} from '@microstore/site-schema';
import type { Session } from '../src/auth/sessions';
import { createDb } from '../src/db';
import { StoreService } from '../src/stores/store-service';

const tenantId = process.argv[2] ?? 'tenant-demo';
if (process.env.NODE_ENV === 'production') throw new Error('Not for production');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');

const db = createDb(process.env.DATABASE_URL);
const stores = new StoreService(db, {
  rootDomain: process.env.ROOT_DOMAIN ?? 'microstore.localhost',
  storefrontUrlTemplate: process.env.STOREFRONT_URL_TEMPLATE ?? 'http://{host}',
});

const store = await db.store.findUnique({ where: { getorioTenantId: tenantId } });
const owner = await db.merchant.findFirst({ where: { getorioTenantId: tenantId } });
if (!store || !owner) throw new Error(`No store/merchant for tenant ${tenantId}`);

const current = migrateSiteConfig(store.draftConfig);
const { business } = current;
const has = (slug: string) => current.pages.some((p) => p.slug === slug);
const layout = getLayout(current.layoutId) ?? getLayout('bold-01');
if (!layout) throw new Error('No layout');

const fresh = generateSiteConfig(
  {
    business: {
      name: business.name,
      tagline: business.tagline,
      description: business.description,
      category: business.category as BusinessCategory,
    },
    branding: {
      logoUrl: business.logoUrl,
      primaryColor: current.theme.primaryColor,
      secondaryColor: current.theme.secondaryColor,
      fontFamily: current.theme.fontFamily,
    },
    contact: { ...business.contact, social: { ...business.social } },
    pages: { about: has('about'), contact: has('contact'), custom: null },
    layoutId: current.layoutId,
    subdomain: 'placeholder',
  },
  layout.defaults,
);

const pages = current.pages.map((page) => {
  const replacement = fresh.pages.find((p) => p.slug === page.slug);
  return ['home', 'about', 'contact'].includes(page.slug) && replacement
    ? { ...page, sections: replacement.sections }
    : page;
});

const session = {
  merchantId: owner.id,
  getorioTenantId: tenantId,
  getorioUserId: owner.getorioUserId,
  role: 'owner',
} as Session;
await stores.saveDraft(session, store.id, { ...current, pages });
console.log(
  `Updated draft of "${store.name}": ${pages
    .filter((p) => ['home', 'about', 'contact'].includes(p.slug))
    .map((p) => `${p.slug} (${p.sections.length} sections)`)
    .join(', ')}`,
);
await db.$disconnect();
