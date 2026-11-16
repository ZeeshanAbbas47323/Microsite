import AxeBuilder from '@axe-core/playwright';
import { LAYOUTS } from '@microstore/layouts';
import { expect, test, type Page } from '@playwright/test';
import { ssoUrl, storeOrigin } from './helpers';

/**
 * Accessibility gate for every layout (requirements §9: WCAG 2.1 AA). Each layout gets its own
 * tenant and published store; every storefront page is scanned with axe.
 */
const PAGES = ['/', '/products', '/products/p-1004', '/cart', '/about', '/contact'];
const run = Date.now().toString(36);

async function dashboardApi(page: Page) {
  const session = (await (await page.request.get('/api/dashboard/auth/session')).json()) as {
    csrfToken: string;
  };
  return (path: string, body?: unknown) =>
    page.request.post(`/api/dashboard${path}`, {
      headers: { 'x-csrf-token': session.csrfToken },
      data: body,
    });
}

test.describe('layouts are accessible', () => {
  test('every layout passes axe on every storefront page', async ({ page, baseURL }) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const layout of LAYOUTS) {
      await page.context().clearCookies();
      await page.goto(await ssoUrl(`a11y-${run}-${layout.id}`));
      await page.waitForURL(/\/dashboard/);
      const post = await dashboardApi(page);
      const subdomain = `a11y-${run}-${layout.id}`;
      const { theme } = layout.defaults;
      const created = await post('/stores', {
        business: {
          name: 'Axe Store',
          tagline: 'Checked for accessibility',
          description: 'Every page of this store is scanned by axe.',
          category: 'fashion',
        },
        branding: {
          logoUrl: '',
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          fontFamily: theme.fontFamily,
        },
        contact: {
          phone: '0300 1234567',
          whatsapp: '0300 1234567',
          email: '',
          address: '1 Mall Road',
          city: 'Lahore',
          social: { facebook: '', instagram: '', tiktok: '' },
        },
        pages: { about: true, contact: true, custom: null },
        layoutId: layout.id,
        subdomain,
      });
      expect(created.status(), await created.text()).toBe(201);
      const { store } = (await created.json()) as { store: { id: string } };
      expect((await post(`/stores/${store.id}/publish`)).ok()).toBe(true);

      const origin = storeOrigin(baseURL as string, subdomain);
      for (const path of PAGES) {
        await page.goto(`${origin}${path}`);
        await expect(page.locator('main')).toBeVisible();
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        for (const v of result.violations) {
          failures.push(
            `${layout.id} ${path}: ${v.id} (${v.impact}) — ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(', ')}`,
          );
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
