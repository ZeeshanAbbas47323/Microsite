import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ssoUrl } from './helpers';

/**
 * The full-screen theme editor: sections tree, section settings, live preview and undo, plus an
 * accessibility scan of the editor chrome (the storefront itself is covered by layouts-a11y).
 */
test('theme editor: select, edit, preview, undo; accessible', async ({ page }) => {
  test.setTimeout(120_000);
  const run = Date.now().toString(36);
  await page.goto(await ssoUrl(`editor-${run}`));
  await page.waitForURL(/\/dashboard/);
  // A fresh tenant goes through onboarding; create the store through the API like the wizard.
  const session = (await (await page.request.get('/api/dashboard/auth/session')).json()) as {
    csrfToken: string;
  };
  const created = await page.request.post('/api/dashboard/stores', {
    headers: { 'x-csrf-token': session.csrfToken },
    data: {
      business: { name: 'Editor Shop', tagline: '', description: '', category: 'fashion' },
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
      subdomain: `editor-${run}`,
    },
  });
  expect(created.status()).toBe(201);

  await page.goto('/dashboard/design');
  await expect(page.getByRole('tab', { name: 'Sections' })).toBeVisible();
  const preview = page.frameLocator('iframe[title="Store preview"]').first();
  await expect(preview.getByRole('heading', { level: 1 })).toBeVisible();

  const chrome = () =>
    new AxeBuilder({ page })
      .exclude('iframe')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
  expect((await chrome()).violations.map((v) => v.id)).toEqual([]);

  // Open the FAQ section from the tree and change its heading.
  await page.getByRole('button', { name: 'Questions? We have answers FAQ', exact: true }).click();
  const heading = page.getByLabel('Heading');
  await heading.fill('Common questions');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Store preview"]:not([aria-hidden])').getByRole('heading', {
      name: 'Common questions',
    }),
  ).toBeVisible({ timeout: 20_000 });
  expect((await chrome()).violations.map((v) => v.id)).toEqual([]);

  // The footer is editable too: brand description shows under the store name.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /^Footer/ }).click();
  await page.getByLabel('About your brand').fill('Handmade in Lahore since 2015.');
  await expect(
    page
      .frameLocator('iframe[title="Store preview"]:not([aria-hidden])')
      .getByText('Handmade in Lahore since 2015.'),
  ).toBeVisible({ timeout: 20_000 });

  // Two undo steps (footer text, FAQ heading) bring back the saved state.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();

  // Double-click a text in the preview to type over it; the sidebar field follows along.
  const live = page.frameLocator('iframe[title="Store preview"]:not([aria-hidden])');
  await live.getByRole('heading', { level: 1 }).dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Fresh arrivals');
  await expect(page.getByLabel('Heading', { exact: true })).toHaveValue('Fresh arrivals');
  await page.keyboard.press('Enter');
  await expect(live.getByRole('heading', { level: 1, name: 'Fresh arrivals' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();

  // Double-clicking an image (here the empty image of the About block) opens the file picker.
  const chooser = page.waitForEvent('filechooser');
  await live.locator('[data-ms-section="home-about"] [data-ms-image]').dblclick();
  await (
    await chooser
  ).setFiles({
    name: 'shop.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByText('Unsaved changes')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Replace' })).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Store preview"]:not([aria-hidden])')
      .locator('[data-ms-section="home-about"] img[data-ms-image]'),
  ).toBeVisible({ timeout: 20_000 });
});
