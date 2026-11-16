# Phase 1 (MVP) report

Date: 2026-11-12. Scope and acceptance criteria: requirements §10, "Phase 1".

## Acceptance criteria

| Criterion                                                                                                         | Result | Evidence                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merchant creates a store via the form and sees a working draft preview in under 10 minutes                        | ✅     | E2E `merchant signs in and completes onboarding` (~4 s automated); design editor shows the draft in a signed preview iframe                           |
| Publishing makes the store reachable at `name.<ROOT_DOMAIN>`; unpublishing takes it offline                       | ✅     | E2E `draft is not public; publishing makes it live` (404 before, live after); API tests for unpublish                                                 |
| Customer can place a COD order; it appears in the dashboard and is pushed to the Getorio mock with correct totals | ✅     | E2E `customer buys…` + `merchant sees the order synced to Getorio`; API `checkout.test.ts` checks totals and the pushed payload                       |
| Duplicate submits create exactly one order                                                                        | ✅     | `checkout.test.ts`: concurrent + repeated submits with one key → one order; key reused with another cart → 409                                        |
| If the Getorio mock is down, the order is saved and later synced automatically after recovery                     | ✅     | `checkout.test.ts`: saved as `pending_sync` (+ `stock_unverified`), retried, synced after recovery; 8 failures → `sync_failed` + alert + manual retry |
| Tenant isolation tests pass                                                                                       | ✅     | `tenant-isolation.test.ts`, plus isolation cases for orders, products, images and preview tokens                                                      |
| Lighthouse mobile targets on the sample store (Perf ≥ 90, A11y ≥ 95, SEO ≥ 95, Best Practices ≥ 95)               | ✅     | See below                                                                                                                                             |

E2E passed against both the local dev stack and the Docker stack (separate worker container).

## Lighthouse (mobile, simulated 4G), seeded "Demo Bazaar" store

| Page           | Performance | Accessibility | Best practices | SEO | LCP   |
| -------------- | ----------- | ------------- | -------------- | --- | ----- |
| Home           | 97          | 100           | 100            | 100 | 2.4 s |
| Product detail | 97          | 100           | 100            | 100 | 2.5 s |
| Product list   | 99          | 100*          | 100            | 100 | 1.9 s |

\* Fixed a heading-order issue (98 before). LCP is at the 2.5 s limit on the product page with placeholder images;
real product photos on a CDN should be re-measured.

## Load test baseline (k6, Docker stack on a laptop, single API/web instance)

| Scenario                                    | Load                            | Result                                                 |
| ------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| Storefront browsing (5 pages per iteration) | ramp to 100 virtual users, 70 s | 15,965 requests, 0 % errors, p95 235 ms                |
| COD checkout via API                        | 5 orders/s for 60 s             | 300 orders, 100 % created, p95 47 ms (target < 800 ms) |

## Test suite

| Package                  | Tests             |
| ------------------------ | ----------------- |
| site-schema              | 220 (100 % lines) |
| getorio-client           | 78                |
| layouts                  | 11                |
| web                      | 11                |
| api (MySQL + Redis + S3) | 139 (~95 % lines) |
| e2e (Playwright)         | 4                 |

## Delivered in Phase 1

Monorepo, DB schema, SSO (stub-compatible JWT) with mock Getorio, onboarding, site generation, 2 layouts, storefront
(home, products, product detail, about, contact, custom page, cart, checkout, confirmation), subdomain routing,
publish/unpublish, design editor (more than the "minimal" scope: sections, pages, SEO, history), COD checkout, order sync
with retries, orders in the dashboard, SEO basics, image uploads, order emails + SMS/WhatsApp hook, optional Turnstile,
seed script, Docker setup, metrics/Sentry hooks.

## Phase 1 close-out (2026-11-16)

| Item                                | Result                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unavailable stores (FR-4.6)         | The web proxy checks `/public/store-status` and answers with a small page naming the store: 404 for unpublished/unknown, **503 + Retry-After** for suspended. Live status cached 30 s, unknown hosts 5 s, unpublished/suspended never (so publishing is instant).     |
| Customer notifications              | Moved to a BullMQ `notifications` queue, processed by the worker (or in-process in dev).                                                                                                                                                                              |
| Store deletion / PII erasure (§9.1) | Owner-only `DELETE /stores/:id` with typed confirmation: deletes orders and order items (customer data), versions, domains, product selections, image records **and image files**; audit log keeps only that a deletion happened. Dashboard: Settings → Delete store. |
| Queue dashboard (§9.6)              | Platform admins get Dashboard → Admin: queue counts, failed jobs with retry, failed order syncs across stores with retry (`/admin/queues`, `/admin/failed-syncs`).                                                                                                    |
| Content-Security-Policy             | Set on every page by the proxy at runtime; only the dashboard may frame the draft preview.                                                                                                                                                                            |
| CI                                  | GitHub Actions `check` passed on the Phase 1 commit; an `e2e` job now runs the full stack + Playwright.                                                                                                                                                               |
| Dashboard thumbnails                | Not a bug: the placeholder images are very light; verified they load.                                                                                                                                                                                                 |

## Known gaps / follow-ups

- Real Getorio integration is planned **after the demo** (decision 2026-11-16). Until then the mock client is used;
  the PHP team needs [GETORIO_API_CONTRACT.md](GETORIO_API_CONTRACT.md) and the SSO decision.
- CSP allows `'unsafe-inline'` scripts (needed for statically cached Next.js pages without nonces).
- Admin panel beyond queues/failed syncs (store list, suspend), order tracking, payments, analytics: Phase 3.
  Command box, layouts 3–5, Urdu UI: Phase 2.
