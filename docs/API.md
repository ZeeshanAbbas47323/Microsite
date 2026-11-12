# API (`apps/api`)

REST + JSON under `/api/v1`. Hand-maintained for now; an OpenAPI spec will be generated from the route
schemas once the route set settles.

## Conventions

- **Errors:** `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.
  Codes: `bad_request`, `validation_error`, `unauthorized`, `forbidden`, `csrf_failed`, `not_found`, `conflict`,
  `rate_limited`, `store_suspended`, `internal_error`.
- **Auth:** HTTP-only `ms_session` cookie (SameSite=Lax, Secure in production, 8 h absolute, id rotates every 15 min).
- **CSRF:** every authenticated `POST`/`PUT`/`PATCH`/`DELETE` must send `X-CSRF-Token` with the `csrfToken` returned
  by `/auth/sso` or `/auth/session`.
- **Tenant scoping:** a merchant only sees the store of their Getorio tenant. Another tenant's ids return `404`.
- **Ids:** UUIDv7 strings. A malformed id returns `400`.

## Implemented

### Platform

| Method | Path      | Notes                                                               |
| ------ | --------- | ------------------------------------------------------------------- |
| GET    | `/health` | Liveness: `{ status: "ok" }`                                        |
| GET    | `/ready`  | Readiness: DB (and Redis when configured). `503` when a check fails |

### Auth

| Method | Path            | Body / query                               | Response                                                                                                                            |
| ------ | --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/sso`     | `{ token }` (Getorio JWT, ≤ 60 s lifetime) | `{ merchant: { id, tenantId, role }, csrfToken, expiresAt }` + session cookie. Rate limit 20/min/IP. A token with `jti` works once. |
| GET    | `/auth/session` |                                            | Same as above                                                                                                                       |
| POST   | `/auth/logout`  |                                            | `204`, clears the cookie                                                                                                            |

### Stores (authenticated)

| Method | Path                                | Body / query                                                                                             | Response                                                                                             |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/layouts`                          | (public)                                                                                                 | `{ layouts: [{ id, name, description, thumbnail }] }`                                                |
| GET    | `/subdomains/check`                 | `?name=`                                                                                                 | `{ available, subdomain, reason?, message? }` (`reason`: format problem, `reserved`, `taken`)        |
| GET    | `/stores/me`                        |                                                                                                          | `{ store: Store \| null }`                                                                           |
| POST   | `/stores`                           | onboarding form (`onboardingInputSchema` in `site-schema`)                                               | `201 { store }`; `409` if the tenant has a store or the subdomain is taken                           |
| GET    | `/stores/:id`                       |                                                                                                          | `{ store }`                                                                                          |
| PATCH  | `/stores/:id/settings`              | any of `shippingFlatFee`, `freeShippingThreshold`, `notifications`, `whatsappButton`, `rtl`, `subdomain` | `{ store }`. A new subdomain becomes primary; old ones redirect for 30 days                          |
| GET    | `/stores/:id/config/draft`          |                                                                                                          | `{ config, updatedAt }`                                                                              |
| PUT    | `/stores/:id/config/draft`          | `{ config }` (full site config)                                                                          | `{ config, updatedAt }`; creates a draft revision                                                    |
| PATCH  | `/stores/:id/config/draft`          | `{ patch: JsonPatchOperation[] }` (RFC 6902)                                                             | `{ config, updatedAt }`; whole result is schema-validated                                            |
| POST   | `/stores/:id/publish`               |                                                                                                          | `{ store }`; immutable `published` version, cache revalidation. `403 store_suspended` when suspended |
| POST   | `/stores/:id/unpublish`             |                                                                                                          | `{ store }` (status `draft`; published config kept)                                                  |
| GET    | `/stores/:id/versions`              |                                                                                                          | `{ versions: [{ id, kind, source, label, createdBy, createdAt }] }` newest first                     |
| POST   | `/stores/:id/versions/:vid/restore` |                                                                                                          | `{ config, updatedAt }`; restores into the draft                                                     |

`Store`:

```json
{
  "id": "01a1…",
  "name": "Zara Crafts",
  "status": "draft | published | suspended",
  "currency": "PKR",
  "timezone": "Asia/Karachi",
  "subdomain": "zara",
  "hostname": "zara.getorio.com",
  "url": "https://zara.getorio.com",
  "settings": {
    "shippingFlatFee": "0.00",
    "freeShippingThreshold": null,
    "notifications": { "customerEmail": true, "customerMessage": false },
    "whatsappButton": true,
    "rtl": false
  },
  "layoutId": "bold-01",
  "hasUnpublishedChanges": true,
  "publishedAt": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

### Merchant products, orders, preview (authenticated)

| Method | Path                                 | Body / query                  | Response                                                                                      |
| ------ | ------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/stores/:id/products`               | `?page&pageSize(≤100)&search` | Getorio products with `visible`/`featured` flags and `stockQty`. `503` when Getorio is down   |
| PATCH  | `/stores/:id/products/:pid`          | `{ visible?, featured? }`     | `{ product }`; updates Getorio, mirrors in `store_products`, refreshes the storefront         |
| GET    | `/stores/:id/orders`                 | `?page&pageSize&status`       | `{ items, total, page, pageSize }`; each with sync status, `getorioOrderUrl`, `lastSyncError` |
| GET    | `/stores/:id/orders/:oid`            |                               | `{ order }` with address and items                                                            |
| POST   | `/stores/:id/orders/:oid/retry-sync` |                               | `{ order }`; only for `sync_failed` / `pending_sync`, else `409`                              |
| POST   | `/stores/:id/preview-token`          |                               | `{ token, expiresAt, url }`; 1 h signed link to view the draft                                |

### Public storefront (no auth, rate limited)

The store is resolved from the `X-Store-Host` header (sent by the Next.js server), else `Host`, through the
`domains` table only. Unknown host → `404 store_not_found`; unpublished → `404 store_unavailable`
(`details.name` for the branded page); suspended → `503 store_suspended`. Old subdomains keep working during their
30-day redirect window; `store.hostname` is always the primary host, so the web app can redirect.
`?preview=<token>` on store/product reads serves the draft instead.

| Method | Path                   | Notes                                                                                                                                                                                                            |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/public/store`        | `{ store: { name, hostname, currency, timezone, settings }, config, preview }`. 300/min                                                                                                                          |
| GET    | `/public/products`     | `?page&pageSize(≤48)&search&category&featured=true&sort=featured\|newest\|price-asc\|price-desc\|name` → `{ items, total, page, pageSize, categories, stale }`. `stale: true` = Getorio unreachable, cached copy |
| GET    | `/public/products/:id` | `{ product }`; hidden/inactive → `404`                                                                                                                                                                           |
| POST   | `/public/checkout`     | Header `Idempotency-Key` (16–128 URL-safe chars). 10/min/IP. See below                                                                                                                                           |

Public product: `{ id, sku, name, description, price, compareAtPrice, currency, images, category, featured, inStock,
variants: [{ id, name, options, price, inStock }] }`. Exact stock counts are never exposed.

**Checkout body**

```json
{
  "customer": { "name": "Ayesha Khan", "phone": "03001234567", "email": "" },
  "shipping": { "address": "House 5, Street 2, DHA Phase 5", "city": "Karachi" },
  "notes": "Call before delivery",
  "items": [{ "productId": "p-1004", "variantId": "v-1004-9", "qty": 1 }],
  "paymentMethod": "cod",
  "website": ""
}
```

- Prices are never accepted from the client; every line is re-priced from Getorio (variant price when given).
- Shipping: `shippingFlatFee`, free when subtotal ≥ `freeShippingThreshold`.
- `201 { order }` for a new order, `200` with the same order for a repeated key, `409` when the key is reused with a
  different cart. `409 out_of_stock` lists each problem line with `reason`:
  `unavailable`, `variant_required`, `out_of_stock`, `insufficient_stock`.
- `website` is a honeypot and must be empty.
- If Getorio is unreachable the cached catalog is used and the order is flagged `stockUnverified`; with no cache, `503`.

`order`: `{ orderRef, status: "received", currency, subtotal, shippingFee, total, paymentMethod, items, createdAt }`.

### Webhooks

| Method | Path                | Notes                                                                                                                                                                                                                                       |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/getorio` | HMAC-signed (see `docs/GETORIO_API_CONTRACT.md`). `204` on success, `401` on a bad signature/payload, `503` without `GETORIO_WEBHOOK_SECRET`. Repeated event ids are ignored. Product/stock events refresh the catalog cache and storefront |

## Storefront cache revalidation

When `WEB_REVALIDATE_URL` and `REVALIDATE_SECRET` are set, publish/unpublish, settings and product flag changes and
Getorio product/stock webhooks call `POST {WEB_REVALIDATE_URL}` with header `x-revalidate-secret` and body
`{ "hostnames": [...] }`; apps/web expires the `store:<host>` cache tag. Failures are logged; pages refresh within 60 s
anyway.

## Order sync

Checkout stores the order as `pending_sync` and enqueues a BullMQ job (`order-sync`, job id `order-<id>`).
The worker (`pnpm --filter @microstore/api start:worker`, or in-process with `RUN_WORKER_IN_PROCESS=true`) pushes it to
Getorio with the order id as idempotency key: 8 attempts, exponential backoff from 30 s, then `sync_failed` plus an
alert log. Non-retryable Getorio errors fail at once. A sweeper re-enqueues orders stuck in `pending_sync` > 10 min.

### Images (authenticated, FR-6.8)

| Method | Path                                     | Notes                                                                                                                                                                                                                                                                |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/stores/:id/assets?purpose=logo\|image` | `multipart/form-data`, field `file`. JPG/PNG/WebP/GIF/AVIF/HEIC (SVG only for logos). Max 2 MB (logo) / 5 MB. Re-encoded to WebP (max 1600 px), metadata stripped. `201 { asset: { id, url, width, height, sizeBytes } }`; `409` when the 200 MB store quota is full |
| GET    | `/stores/:id/assets`                     | `{ items, usedBytes, quotaBytes }`                                                                                                                                                                                                                                   |
| DELETE | `/stores/:id/assets/:aid`                | `204`, frees quota                                                                                                                                                                                                                                                   |
| GET    | `/public/media/<key>`                    | Public, immutable. apps/web serves it as `/media/<key>` on every host; asset `url`s are these relative paths                                                                                                                                                         |

### Checkout extras

- `captchaToken` in the checkout body is required when `TURNSTILE_SECRET` is set (`400 captcha_failed` otherwise).
  Idempotent replays of an existing order do not need a new token.
- After an order is created the customer gets an email (if given, and enabled in settings) and, when
  `MESSAGE_WEBHOOK_URL` is set and enabled in settings, an SMS/WhatsApp message via the hook. Failures never affect the order.

### Operations

| Method | Path       | Notes                                                                                                                                                                                                                  |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/metrics` | Prometheus metrics (`http_request_duration_seconds`, `orders_placed_total`, `order_sync_total{outcome}`, `order_sync_queue_jobs{state}`, process metrics). Needs `Authorization: Bearer $METRICS_TOKEN`; 404 otherwise |

## Not implemented yet (later phases)

- Admin routes (Phase 2/3), order tracking `GET /public/orders/lookup` (P1)
