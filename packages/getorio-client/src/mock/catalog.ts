import type { GetorioProduct, GetorioVariant } from '../types';

export const SAMPLE_TENANT_ID = 'tenant-demo';

const CATEGORIES = {
  bags: { id: 'cat-bags', name: 'Bags' },
  accessories: { id: 'cat-accessories', name: 'Accessories' },
  footwear: { id: 'cat-footwear', name: 'Footwear' },
  home: { id: 'cat-home', name: 'Home' },
} as const;

const CATEGORY_COLORS: Record<keyof typeof CATEGORIES, [string, string]> = {
  bags: ['f3e8d8', '7c4a1e'],
  accessories: ['e0ecf5', '1f4e79'],
  footwear: ['ede4f6', '5b2a86'],
  home: ['e3f1e6', '2d6a3e'],
};

/** Placeholder product photo (dev/test only). */
function image(name: string, category: keyof typeof CATEGORIES) {
  const [bg, fg] = CATEGORY_COLORS[category];
  // No query string: next/image remote patterns reject image URLs with search params by default.
  return [{ url: `https://placehold.co/800x800/${bg}/${fg}.png`, alt: name }];
}

interface ProductSeed {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: string;
  compareAtPrice?: string;
  category: keyof typeof CATEGORIES;
  stockQty?: number;
  variants?: GetorioVariant[];
  active?: boolean;
  visible?: boolean;
  featured?: boolean;
}

const SEEDS: ProductSeed[] = [
  {
    id: 'p-1001',
    sku: 'BAG-TOTE-01',
    name: 'Leather Tote Bag',
    description: 'Roomy hand-stitched leather tote for everyday use.',
    price: '4500.00',
    category: 'bags',
    stockQty: 12,
    featured: true,
  },
  {
    id: 'p-1002',
    sku: 'BAG-CLUTCH-01',
    name: 'Embroidered Clutch',
    description: 'Hand-embroidered clutch with a magnetic clasp.',
    price: '2200.00',
    compareAtPrice: '2800.00',
    category: 'bags',
    stockQty: 5,
    featured: true,
  },
  {
    id: 'p-1003',
    sku: 'ACC-SCARF-01',
    name: 'Block Print Scarf',
    description: 'Soft cotton scarf with traditional block print.',
    price: '1200.00',
    category: 'accessories',
    stockQty: 30,
  },
  {
    id: 'p-1004',
    sku: 'FW-KHUSSA-01',
    name: 'Classic Khussa',
    description: 'Handmade leather khussa, available in three sizes.',
    price: '3200.00',
    category: 'footwear',
    featured: true,
    variants: [
      {
        id: 'v-1004-7',
        sku: 'FW-KHUSSA-01-7',
        name: 'Size 7',
        options: { Size: '7' },
        price: '3200.00',
        stockQty: 4,
        active: true,
      },
      {
        id: 'v-1004-8',
        sku: 'FW-KHUSSA-01-8',
        name: 'Size 8',
        options: { Size: '8' },
        price: '3200.00',
        stockQty: 0,
        active: true,
      },
      {
        id: 'v-1004-9',
        sku: 'FW-KHUSSA-01-9',
        name: 'Size 9',
        options: { Size: '9' },
        price: '3400.00',
        stockQty: 2,
        active: true,
      },
    ],
  },
  {
    id: 'p-1005',
    sku: 'HOME-CANDLE-01',
    name: 'Scented Soy Candle',
    description: 'Hand-poured soy candle with a jasmine scent.',
    price: '900.00',
    category: 'home',
    stockQty: 0,
  },
  {
    id: 'p-1006',
    sku: 'HOME-MUG-01',
    name: 'Blue Pottery Mug',
    description: 'Multani blue pottery mug. Not listed on the microstore.',
    price: '750.00',
    category: 'home',
    stockQty: 20,
    visible: false,
  },
  {
    id: 'p-1007',
    sku: 'BAG-OLD-01',
    name: 'Discontinued Satchel',
    description: 'No longer sold.',
    price: '3900.00',
    category: 'bags',
    stockQty: 3,
    active: false,
  },
  {
    id: 'p-1008',
    sku: 'HOME-COASTER-01',
    name: 'Jute Coaster Set (6)',
    description: 'Set of six hand-woven jute coasters.',
    price: '650.00',
    category: 'home',
    stockQty: 40,
    featured: true,
  },
  {
    id: 'p-1009',
    sku: 'ACC-WALLET-01',
    name: 'Slim Leather Wallet',
    description: 'Minimal bifold wallet with four card slots.',
    price: '1800.00',
    category: 'accessories',
    stockQty: 18,
  },
  {
    id: 'p-1010',
    sku: 'ACC-POUCH-01',
    name: 'Ajrak Pouch',
    description: 'Zippered pouch in classic ajrak print.',
    price: '850.00',
    compareAtPrice: '1000.00',
    category: 'accessories',
    stockQty: 25,
  },
  {
    id: 'p-1011',
    sku: 'HOME-CUSHION-01',
    name: 'Embroidered Cushion Cover',
    description: '16x16 inch cushion cover with mirror work.',
    price: '1400.00',
    category: 'home',
    stockQty: 9,
  },
  {
    id: 'p-1012',
    sku: 'BAG-BACKPACK-01',
    name: 'Canvas Backpack',
    description: 'Durable canvas backpack with a padded laptop sleeve.',
    price: '5200.00',
    category: 'bags',
    stockQty: 7,
  },
];

/** Deterministic sample catalog (PKR) used for local development, seeds and tests. */
export function createSampleCatalog(updatedAt = '2026-01-01T00:00:00.000Z'): GetorioProduct[] {
  return SEEDS.map((s) => {
    const variants = s.variants ?? [];
    const stockQty = variants.length
      ? variants.filter((v) => v.active).reduce((sum, v) => sum + v.stockQty, 0)
      : (s.stockQty ?? 0);
    return {
      id: s.id,
      sku: s.sku,
      name: s.name,
      description: s.description,
      price: s.price,
      compareAtPrice: s.compareAtPrice ?? null,
      currency: 'PKR',
      images: image(s.name, s.category),
      category: { ...CATEGORIES[s.category] },
      variants: structuredClone(variants),
      stockQty,
      active: s.active ?? true,
      microstore: { visible: s.visible ?? true, featured: s.featured ?? false },
      updatedAt,
    };
  });
}
