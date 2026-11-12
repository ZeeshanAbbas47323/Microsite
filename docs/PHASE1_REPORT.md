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

## Known gaps / follow-ups

- Real Getorio integration depends on the PHP team implementing [GETORIO_API_CONTRACT.md](GETORIO_API_CONTRACT.md) and
  answering the open questions (SSO, variants, image hosting).
- Unavailable/suspended stores show a generic 404 page (not store-branded, suspended is not 503 in the web app).
- Customer notifications are sent in-process after checkout, not through the job queue.
- No BullMQ UI (queue depth is exported as a metric), no store-deletion/PII-erasure flow, no strict CSP on the web app.
- No CI job yet for E2E/load tests (they need the full stack).
- Admin panel, order tracking, payments, analytics: Phase 3. Command box, layouts 3–5, Urdu UI: Phase 2.
