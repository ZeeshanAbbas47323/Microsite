import { expect, test } from '@playwright/test';
import { ssoUrl, storeOrigin } from './helpers';

/**
 * Phase 1 happy path (requirements §12): onboarding → publish → customer COD checkout →
 * order visible in the dashboard and synced to (mock) Getorio.
 */
test.describe.serial('merchant creates a store and a customer orders', () => {
  const run = Date.now().toString(36);
  const tenant = `e2e-${run}`;
  const subdomain = `e2e-shop-${run}`;
  let orderRef = '';

  test('merchant signs in and completes onboarding', async ({ page }) => {
    await page.goto(await ssoUrl(tenant));
    await expect(page).toHaveURL(/\/dashboard\/onboarding/);
    await expect(page).not.toHaveURL(/token=/);

    // Step 1: business (validation first)
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('This field is required')).toBeVisible();
    await page.getByLabel('Store name').fill('E2E Boutique');
    await page.getByLabel('Tagline').fill('Tested from end to end');
    await page.getByLabel('What do you sell?').selectOption('fashion');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: branding
    await expect(page.getByRole('heading', { name: /Branding/ })).toBeVisible();
    await page.getByLabel('Primary color', { exact: true }).fill('#0f766e');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: contact
    await page.getByLabel('Phone').fill('0300 1234567');
    await page.getByLabel('City').fill('Lahore');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Steps 4 and 5: defaults
    await expect(page.getByRole('heading', { name: /Pages/ })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: /Layout/ })).toBeVisible();
    await page.getByText('Classic', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 6: subdomain with live availability
    await page.getByLabel('Store address').fill('admin');
    await expect(page.getByText('This name is reserved')).toBeVisible();
    await page.getByLabel('Store address').fill(subdomain);
    await expect(page.getByText(/is available/)).toBeVisible();
    await page.getByRole('button', { name: 'Create my store' }).click();

    await expect(page).toHaveURL(/\/dashboard\/design/);
    await expect(page.getByText('Your store is ready as a draft')).toBeVisible();
  });

  test('draft is not public; publishing makes it live', async ({ page, baseURL }) => {
    const store = storeOrigin(baseURL as string, subdomain);
    expect((await page.request.get(`${store}/`)).status()).toBe(404);

    await page.goto(await ssoUrl(tenant));
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Publish store' }).click();
    await expect(page.getByText('Live', { exact: true }).first()).toBeVisible();

    await page.goto(`${store}/`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tested from end to end');
  });

  test('customer buys with cash on delivery', async ({ page, baseURL }) => {
    const store = storeOrigin(baseURL as string, subdomain);
    await page.goto(`${store}/products/p-1004`);
    await page.getByText('Size 9', { exact: false }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to cart.')).toBeVisible();

    await page.goto(`${store}/cart`);
    await expect(page.getByText('Classic Khussa').first()).toBeVisible();
    await page.getByRole('link', { name: 'Checkout' }).click();

    await page.getByLabel('Full name').fill('E2E Customer');
    await page.getByLabel('Mobile number').fill('12345');
    await page.getByLabel('City').fill('Karachi');
    await page.getByLabel('Full address').fill('House 1, Street 2, Clifton');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByText(/Pakistani mobile number/)).toBeVisible();

    await page.getByLabel('Mobile number').fill('0333 7654321');
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you! Your order is placed.' }),
    ).toBeVisible();
    orderRef =
      (await page.locator('strong').filter({ hasText: /^MS-/ }).first().textContent()) ?? '';
    expect(orderRef).toMatch(/^MS-/);
    // Cart is emptied after the order
    await expect(page.getByRole('link', { name: 'Cart, empty' })).toBeVisible();
  });

  test('merchant sees the order synced to Getorio', async ({ page }) => {
    await page.goto(await ssoUrl(tenant));
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard/orders');
    const row = page.getByRole('listitem').filter({ hasText: orderRef });
    await expect(row).toBeVisible();
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(row.getByText('In Getorio')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(row).toContainText('Rs 3,400');
  });
});
