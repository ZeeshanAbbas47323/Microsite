# Getorio API contract for Microstore

**Audience:** the Getorio PHP team. These are the endpoints Microstore calls. The reference implementation of the
client side is `packages/getorio-client` (`HttpGetorioClient`); the in-memory mock (`InMemoryGetorioClient`)
shows the expected behaviour and is what Microstore runs against until these endpoints exist.

Status: **proposal** (see `docs/OPEN_QUESTIONS.md` Q-2). Anything here can change; tell us before implementing
something different so we update the client and its tests together.

## Conventions

| Topic        | Rule                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL     | `${GETORIO_API_BASE_URL}/microstore/v1`                                                                                                                                         |
| Auth         | `X-Api-Key: <service key>` on every request. One key for the Microstore service, not per merchant.                                                                              |
| Tenant scope | `X-Getorio-Tenant: <getorio tenant id>` on every request. Every read and write **must** be limited to that tenant. A product or order from another tenant must look like `404`. |
| Format       | JSON, UTF-8. Timestamps are ISO 8601 with offset (`2026-11-12T10:00:00Z`).                                                                                                      |
| Money        | Decimal **strings** with at most 2 fraction digits: `"1499.00"`. Never floats. Currency is ISO 4217 (`"PKR"`).                                                                  |
| Ids          | Strings, max 64 chars.                                                                                                                                                          |
| Timeouts     | Microstore waits at most **5 s** per request.                                                                                                                                   |
| Retries      | Microstore retries `429`, `5xx`, timeouts and network errors (up to 2 extra attempts, exponential backoff with jitter). All endpoints below must be safe to repeat.             |
| Errors       | Use status codes as below. Body: `{ "error": { "code": "string", "message": "string" } }` (logged, not shown to users).                                                         |

| Status                | Meaning for Microstore                          |
| --------------------- | ----------------------------------------------- |
| `200` / `201` / `204` | Success                                         |
| `400`, `422`          | Request rejected (not retried)                  |
| `401`, `403`          | Bad key or tenant scope (not retried, alerts)   |
| `404`                 | Not found in this tenant                        |
| `409`                 | Idempotency key reused with a different payload |
| `429`, `5xx`          | Temporarily unavailable (retried)               |

## Product object

```json
{
  "id": "p-1004",
  "sku": "FW-KHUSSA-01",
  "name": "Classic Khussa",
  "description": "Handmade leather khussa.",
  "price": "3200.00",
  "compareAtPrice": null,
  "currency": "PKR",
  "images": [{ "url": "https://cdn.getorio.com/...", "alt": "Classic Khussa" }],
  "category": { "id": "cat-footwear", "name": "Footwear" },
  "variants": [
    {
      "id": "v-1004-7",
      "sku": "FW-KHUSSA-01-7",
      "name": "Size 7",
      "options": { "Size": "7" },
      "price": "3200.00",
      "stockQty": 4,
      "active": true
    }
  ],
  "stockQty": 6,
  "active": true,
  "microstore": { "visible": true, "featured": true },
  "updatedAt": "2026-11-12T10:00:00Z"
}
```

- `stockQty` on the product is the total sellable stock (sum of active variants when it has variants).
- `microstore.visible` is the **"Show on Microstore"** flag; `featured` marks products for the home page grid.
- Image URLs must be `http(s)`; `https` strongly preferred.

## Endpoints

### `GET /products`

Query: `page` (≥1), `pageSize` (1–100), `search` (optional, matches name or SKU, case-insensitive),
`categoryId` (optional), `onlyMicrostore` (optional `true`: only `active` **and** `microstore.visible` products).

Response `200`:

```json
{ "items": [Product], "page": 1, "pageSize": 20, "total": 57 }
```

Out-of-stock products are still returned (the storefront shows them as "Out of stock").

### `GET /products/{productId}`

Response `200`: `Product`. `404` if it does not exist for the tenant.

### `POST /stock/query`

Body: `{ "ids": ["p-1001", "v-1004-7"] }` (product or variant ids, max 500).
Response `200`: `{ "stock": { "p-1001": 12, "v-1004-7": 4 } }`. Unknown ids are left out.
POST is used so long id lists do not hit URL limits; it has no side effects.

### `POST /orders`

Headers: `Idempotency-Key: <uuid>` (required, max 128 chars).

Body:

```json
{
  "microstoreOrderRef": "MS-7K2P9Q",
  "source": "microstore",
  "customer": { "name": "Ayesha Khan", "phone": "+923001234567", "email": null },
  "shipping": { "address": "House 5, Street 2, DHA Phase 5", "city": "Karachi" },
  "items": [
    {
      "productId": "p-1001",
      "variantId": null,
      "sku": "BAG-TOTE-01",
      "name": "Leather Tote Bag",
      "qty": 2,
      "unitPrice": "4500.00",
      "lineTotal": "9000.00"
    }
  ],
  "subtotal": "9000.00",
  "shippingFee": "250.00",
  "total": "9250.00",
  "currency": "PKR",
  "paymentMethod": "cod",
  "notes": null,
  "placedAt": "2026-11-12T10:00:00Z"
}
```

Response `201` (or `200` for a repeat): `{ "getorioOrderId": "GO-100001" }`.

Rules:

- **Idempotency:** the same key with the same body must return the same `getorioOrderId` and must not create a second
  order. The same key with a different body returns `409`. Keys are scoped per tenant; keep them at least 30 days.
- Prices are already re-validated by Microstore at checkout; Getorio should store them as given.
- The customer has already been told the order is placed, so **do not reject for low stock**. Decrement stock
  (never below zero) and let the merchant handle shortfalls.
- Unknown `productId`/`variantId` for the tenant → `422`.
- Phone is always normalized to `+923XXXXXXXXX`.

### `GET /orders/{getorioOrderId}/status`

Response `200`:

```json
{ "getorioOrderId": "GO-100001", "status": "shipped", "updatedAt": "2026-11-13T09:00:00Z" }
```

`status` is one of `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `returned`.
Map Getorio's internal statuses onto these.

### `PUT /products/{productId}/microstore-flags`

Body: `{ "visible": true, "featured": false }`. Response `204`. `404` if the product is not in the tenant.

## Webhooks (Getorio → Microstore)

`POST ${MICROSTORE_API}/api/v1/webhooks/getorio`, sent when products, stock or order statuses change, so Microstore
can invalidate caches and storefront pages.

Headers: `Content-Type: application/json`,
`X-Getorio-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(GETORIO_WEBHOOK_SECRET, "<t>.<raw body>")>`.

Microstore rejects signatures older or newer than 5 minutes, so clocks must be in sync (NTP).

Bodies:

```json
{ "id": "evt_123", "type": "product.updated", "tenantId": "t1", "data": { "productIds": ["p-1001"] } }
{ "id": "evt_124", "type": "stock.updated", "tenantId": "t1", "data": { "productIds": ["p-1001", "p-1004"] } }
{ "id": "evt_125", "type": "order.status_changed", "tenantId": "t1", "data": { "getorioOrderId": "GO-100001" } }
```

- Events are hints: Microstore re-fetches the data, so the body only carries ids.
- Retry failed deliveries (non-2xx) with backoff for at least 24 h. Delivery may be repeated; `id` is used to de-duplicate.
- `productIds` max 500 per event.

## SSO (for reference)

See `docs/OPEN_QUESTIONS.md` Q-1. Proposed: Getorio redirects to `/sso?token=<JWT>` with claims `getorioUserId`,
`getorioTenantId`, `role`, `exp` (≤ 60 s), signed RS256 (or HS256 shared secret in dev).
