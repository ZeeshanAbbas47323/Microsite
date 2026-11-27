import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ssoUrl, storeOrigin } from './helpers';

/**
 * Slideshow sections on a published store: all three looks (text on image with fading, side by
 * side, cards), image-only / text-only / button-less slides, working arrows, dots and pause, and
 * an axe scan on desktop and phone widths.
 */
const run = Date.now().toString(36);
const img = (n: number) => `/demo-products/p-100${n}.webp`;
const slide = (patch: Record<string, string>) => ({
  imageUrl: '',
  eyebrow: '',
  title: '',
  text: '',
  ctaLabel: '',
  ctaLink: '',
  align: 'center',
  ...patch,
});

async function dashboardApi(page: Page) {
  const session = (await (await page.request.get('/api/dashboard/auth/session')).json()) as {
    csrfToken: string;
  };
  const headers = { 'x-csrf-token': session.csrfToken };
  return {
    get: (path: string) => page.request.get(`/api/dashboard${path}`),
    post: (path: string, data?: unknown) =>
      page.request.post(`/api/dashboard${path}`, { headers, data }),
    put: (path: string, data?: unknown) =>
      page.request.put(`/api/dashboard${path}`, { headers, data }),
  };
}

test('slideshows render, move and pass axe', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const subdomain = `slides-${run}`;
  await page.goto(await ssoUrl(subdomain));
  await page.waitForURL(/\/dashboard/);
  const api = await dashboardApi(page);
  const created = await api.post('/stores', {
    business: { name: 'Slide Shop', tagline: 'Shoes', description: 'Shoes', category: 'fashion' },
    branding: {
      logoUrl: '',
      primaryColor: '#1a73e8',
      secondaryColor: '#fbbc04',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '0300 1234567',
      whatsapp: '',
      email: '',
      address: '',
      city: 'Lahore',
      social: { facebook: '', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: null },
    layoutId: 'bold-01',
    subdomain,
  });
  expect(created.status(), await created.text()).toBe(201);
  const { store } = (await created.json()) as { store: { id: string } };

  const { config } = (await (await api.get(`/stores/${store.id}/config/draft`)).json()) as {
    config: { pages: { template: string; sections: unknown[] }[] };
  };
  const base = { visible: true, type: 'slideshow' };
  const home = config.pages.find((p) => p.template === 'home');
  home?.sections.unshift(
    {
      ...base,
      id: 'hero-slides',
      props: {
        style: 'overlay',
        transition: 'fade',
        interval: 3,
        slides: [
          slide({
            imageUrl: img(1),
            eyebrow: 'New',
            title: 'Eid edit',
            ctaLabel: 'Shop',
            ctaLink: '/products',
          }),
          slide({ imageUrl: img(2) }),
          slide({ title: 'Cash on delivery', text: 'All over Pakistan', align: 'start' }),
        ],
      },
    },
    {
      ...base,
      id: 'story-slides',
      props: {
        style: 'split',
        tone: 'light',
        fullWidth: false,
        autoplay: false,
        slides: [
          slide({ imageUrl: img(3), title: 'Handmade', text: 'In Lahore', align: 'start' }),
          slide({ imageUrl: img(4), title: 'Leather', ctaLabel: 'See all', ctaLink: '/products' }),
        ],
      },
    },
    {
      ...base,
      id: 'card-slides',
      props: {
        title: 'Lookbook',
        style: 'cards',
        perView: 3,
        autoplay: false,
        slides: [1, 2, 3, 4, 5].map((n) =>
          n === 5
            ? slide({ title: 'Free returns', text: 'Within 7 days' })
            : slide({ imageUrl: img(n), title: `Look ${n}`, ctaLink: '/products' }),
        ),
      },
    },
  );
  const saved = await api.put(`/stores/${store.id}/config/draft`, { config });
  expect(saved.ok(), await saved.text()).toBe(true);
  expect((await api.post(`/stores/${store.id}/publish`)).ok()).toBe(true);

  const origin = storeOrigin(baseURL as string, subdomain);
  await page.goto(`${origin}/`);
  const carousels = page.getByRole('region', { name: /Slideshow|Lookbook/ });
  await expect(carousels).toHaveCount(3);

  // Fading hero: arrows step through slides and only the current one is shown.
  const hero = page.locator('[data-ms-carousel]').first();
  await expect(hero).toHaveAttribute('data-ready', '');
  await hero.getByRole('button', { name: 'Pause slideshow' }).click();
  await expect(hero.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
  await hero.getByRole('button', { name: 'Next slide' }).click();
  await expect(hero.getByRole('button', { name: 'Show slide 2 of 3' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await hero.getByRole('button', { name: 'Show slide 3 of 3' }).click();
  await expect(hero.getByText('Cash on delivery')).toBeVisible();
  await expect(hero.getByText('Eid edit')).toBeHidden();

  // Cards scroll; dots move along with the arrows.
  const cards = page.locator('[data-ms-carousel]').nth(2);
  await cards.getByRole('button', { name: 'Next slide' }).click();
  await expect(cards.getByRole('button', { name: 'Show slide 2 of 5' })).toHaveAttribute(
    'aria-current',
    'true',
  );

  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(await axe()).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('[data-ms-carousel][data-ready]')).toHaveCount(3);
  expect(await axe()).toEqual([]);
  // Nothing spills sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
