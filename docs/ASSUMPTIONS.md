# Assumptions

Defaults chosen where the requirements left room. Each one is easy to change; the location is noted.

## Tooling

| #   | Assumption                                                                          | Where                       |
| --- | ----------------------------------------------------------------------------------- | --------------------------- |
| A-1 | TypeScript 5.9 (not 7.x) because `typescript-eslint` supports `<6.1`.               | root `package.json`         |
| A-2 | ESLint 9 flat config (not 10) for compatibility with Next.js lint presets.          | `eslint.config.mjs`         |
| A-3 | pnpm 9 via Corepack (`packageManager` field). Run `corepack enable` once.           | root `package.json`         |
| A-4 | MySQL image `mysql:8.4` (LTS of the 8.x line, satisfies "8.0+").                    | `docker-compose.yml`        |
| A-5 | Shared packages are built with `tsup` to ESM + CJS + `.d.ts`; apps consume `dist/`. | `packages/*/tsup.config.ts` |

## Site config schema (`packages/site-schema`)

| #    | Assumption                                                                                                                                                                                                        | Where                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| S-1  | `pages[]` holds **content pages only** (`home`, `products`, `about`, `contact`, `custom`). System pages (`productDetail`, `cart`, `checkout`, `orderConfirmation`) are rendered by every layout and never stored. | `constants.ts` `SYSTEM_PAGES`                            |
| S-2  | At most **one page per template** (so max 5 = home + products + about + contact + 1 custom).                                                                                                                      | `config.ts`                                              |
| S-3  | Each page has an explicit `template` field in addition to `slug` (spec example only had `slug`).                                                                                                                  | `config.ts` `pageSchema`                                 |
| S-4  | `home` and `products` slugs are fixed; about/contact/custom slugs are free but may not use reserved routes (`cart`, `checkout`, `api`, ...).                                                                      | `constants.ts` `FIXED_PAGE_SLUGS`, `RESERVED_PAGE_SLUGS` |
| S-5  | Section ids are unique across the whole config, not just per page.                                                                                                                                                | `config.ts`                                              |
| S-6  | All objects are **strict** (unknown keys rejected) to stop smuggling extra data into layouts.                                                                                                                     | all schemas                                              |
| S-7  | "Not set" optional fields use the empty string `""` (matches the spec example), not `null`/absent.                                                                                                                | `primitives.ts` `optionalString`                         |
| S-8  | Merchant text is plain text: tag-like markup (`<b`, `</`, `<!`, `<?`) and control chars are rejected by the schema. `a < b` is allowed. Layouts must still escape on output.                                      | `primitives.ts`                                          |
| S-9  | Links: `http(s)://` or same-site paths starting with `/`. Images: `https://` or `/` only.                                                                                                                         | `primitives.ts`                                          |
| S-10 | Social links must be on their own network's domain (facebook.com / fb.com, instagram.com, tiktok.com).                                                                                                            | `primitives.ts`                                          |
| S-11 | Phone numbers are stored normalized as `+923XXXXXXXXX`; input accepts `03XXXXXXXXX` / `+923XXXXXXXXX` with spaces or dashes.                                                                                      | `primitives.ts` `pkPhoneSchema`                          |
| S-12 | Font whitelist: Inter, Poppins, Roboto, Open Sans, Lato, Montserrat, Nunito, Playfair Display, Merriweather, Noto Nastaliq Urdu.                                                                                  | `constants.ts`                                           |
| S-13 | Enums: buttonStyle `rounded/pill/square`; borderRadius `none/sm/md/lg/xl`; navbar `centered/left/split/minimal`; footer `simple/columns/minimal`.                                                                 | `constants.ts`                                           |
| S-14 | Section props are as defined in `sections.ts`. `richText` uses `paragraphs: string[]` (no HTML/Markdown). `contactInfo` reads data from `business.contact`; its props only control display.                       | `sections.ts`                                            |
| S-15 | `layoutId` is format-checked in the schema; existence is checked by the layouts registry so adding a layout needs no schema change.                                                                               | `config.ts`                                              |
| S-16 | `business` also stores `description` and `category` (collected in onboarding, not in the spec example).                                                                                                           | `config.ts`                                              |

## Onboarding and generation

| #   | Assumption                                                                                                                                                                  | Where                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| G-1 | Required onboarding fields: store name, category, colors, font, phone, city, layout, subdomain. Tagline, description, address, email, WhatsApp, socials, logo are optional. | `generator.ts` `onboardingInputSchema` |
| G-2 | Business categories: fashion, electronics, beauty, food, grocery, home-decor, handmade, general.                                                                            | `generator.ts`                         |
| G-3 | Generated copy avoids invented claims (no fake testimonials, delivery times or prices). The only fact stated is COD, which is true in MVP.                                  | `generator.ts`                         |
| G-4 | Merchant branding (primary/secondary color, font) overrides the layout's theme; everything else comes from layout defaults.                                                 | `generator.ts`                         |
| G-5 | Footer text defaults to `© {year} {store name}` (UTC year).                                                                                                                 | `generator.ts`                         |

## Subdomains

| #   | Assumption                                                                                                               | Where                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| D-1 | Input is trimmed and lowercased before validation (`MyShop` → `myshop`).                                                 | `subdomain.ts`                       |
| D-2 | Consecutive hyphens are rejected (blocks `xn--` punycode look-alikes).                                                   | `subdomain.ts`                       |
| D-3 | Reserved list extends the spec's examples (www, app, api, admin, mail, dashboard, static) with common infra/brand names. | `constants.ts` `RESERVED_SUBDOMAINS` |

## Command patches

| #   | Assumption                                                                                                                                                      | Where                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| P-1 | Allowed ops: `replace` (allowlisted scalar paths), `move` (sections within one page), `test`. `add`, `remove`, `copy` are always rejected.                      | `patch.ts`                        |
| P-2 | Text values from the model are **sanitized** (tags stripped, truncated) rather than rejected; if nothing valid remains the result validation rejects the patch. | `patch.ts`                        |
| P-3 | Max 20 operations per patch.                                                                                                                                    | `patch.ts` `MAX_PATCH_OPERATIONS` |
| P-4 | Section text edits (title/subtitle/ctaLabel, P1) are on by default and can be switched off via `CommandScope`.                                                  | `patch.ts`                        |
| P-5 | Contrast warnings are raised only for text/background pairs the patch touched (theme, navbar).                                                                  | `patch.ts`                        |

## Getorio client (`packages/getorio-client`)

| #    | Assumption                                                                                                                                                                                                        | Where                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| C-1  | The PHP endpoints are as proposed in `docs/GETORIO_API_CONTRACT.md` (paths under `/microstore/v1`, `X-Api-Key` + `X-Getorio-Tenant` headers).                                                                     | `http/http-client.ts`             |
| C-2  | Money travels as decimal strings (`"1499.00"`); arithmetic uses integer minor units (`toMinorUnits` / `fromMinorUnits`).                                                                                          | `money.ts`                        |
| C-3  | Every Getorio response is validated with Zod; a mismatch is an `invalid_response` error, never passed through.                                                                                                    | `types.ts`, `http/http-client.ts` |
| C-4  | Retries: 2 extra attempts, exponential backoff with full jitter (base 200 ms), only for `429`/`5xx`/timeouts/network errors. All calls are idempotent (orders carry an `Idempotency-Key`), so all may be retried. | `http/http-client.ts`             |
| C-5  | Circuit breaker per client instance: opens after 5 consecutive retryable failures, half-opens after 30 s with one trial call. 4xx answers count as "service up".                                                  | `http/circuit-breaker.ts`         |
| C-6  | `getStock` accepts product **and** variant ids; unknown ids are omitted. Product `stockQty` = sum of active variants.                                                                                             | `client.ts`, contract             |
| C-7  | Getorio never rejects an order for low stock; it decrements to zero at most (the customer was already told the order is placed).                                                                                  | mock, contract                    |
| C-8  | Idempotency keys are scoped per tenant; same key + different payload → `409 conflict`.                                                                                                                            | mock, contract                    |
| C-9  | Webhooks use `X-Getorio-Signature: t=..,v1=..` (HMAC-SHA256 over `"<t>.<raw body>"`) with a 5-minute window; event types `product.updated`, `stock.updated`, `order.status_changed`.                              | `webhook.ts`                      |
| C-10 | `GETORIO_CLIENT` env selects `mock` (default outside production) or `http`; the mock refuses to start in production.                                                                                              | `factory.ts`                      |
| C-11 | Mock catalog images use `picsum.photos` placeholder URLs (dev only).                                                                                                                                              | `mock/catalog.ts`                 |
| C-12 | Order statuses exposed to Microstore: `pending, confirmed, processing, shipped, delivered, cancelled, returned`.                                                                                                  | `types.ts`                        |
