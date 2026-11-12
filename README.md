# Getorio Microstore

Lets a Getorio merchant launch a small online store (2 to 5 pages) in minutes: fill a short form,
pick a layout, publish to `name.<ROOT_DOMAIN>`, take Cash on Delivery orders that sync into the Getorio OMS.

Full requirements: see the requirements spec. Decisions and open items: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md),
[docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    M[Merchant dashboard]
    C[Customer storefront]
  end
  subgraph apps/web [apps/web - Next.js]
    MW[Middleware: Host -> tenant]
    D[/dashboard/*]
    S[/_sites/:tenant/*]
  end
  subgraph apps/api [apps/api - Fastify]
    API[REST /api/v1]
    W[BullMQ workers: order sync]
  end
  M --> D
  C --> MW --> S
  D --> API
  S --> API
  API --> DB[(MySQL 8)]
  API --> R[(Redis)]
  W --> R
  API --> S3[(S3 / MinIO)]
  API --> AI[Claude API]
  API --> GC[packages/getorio-client]
  W --> GC
  GC --> G[Getorio PHP OMS]
  SS[packages/site-schema] -.shared.-> apps/web
  SS -.shared.-> apps/api
  L[packages/layouts] -.shared.-> apps/web
```

## Repository layout

```
apps/web               Next.js: merchant dashboard + public storefront   (storefront done, dashboard not started)
apps/api               Fastify API + workers                              (in progress)
packages/site-schema   Zod schemas, types, patch allowlist, migrations    (done)
packages/layouts       Layout registry + React section components (2 layouts)
packages/getorio-client Getorio adapter (interface, mock, HTTP)           (done)
packages/config        Shared tsconfig
docs/                  Assumptions, open questions, API docs
```

## Setup

Requirements: Node 22+, Docker.

```bash
corepack enable
```

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

This starts MySQL 8, Redis and MinIO (`:9000`, console `:9001`) and creates the uploads bucket.
If port 3306 or 6379 is already taken on your machine, set `MYSQL_PORT` / `REDIS_PORT` in `.env` (and the matching
ports in `DATABASE_URL`, `DATABASE_URL_TEST`, `REDIS_URL`).

```bash
pnpm build
```

```bash
pnpm --filter @microstore/api db:deploy
```

```bash
pnpm --filter @microstore/api dev
```

In dev (`RUN_WORKER_IN_PROCESS=true`) the order-sync worker runs inside the API; in production run it separately:

```bash
pnpm --filter @microstore/api start:worker
```

Sign in to the dashboard locally (prints a one-time link valid for 60 s, like Getorio's redirect):

```bash
pnpm --filter @microstore/api dev:sso-link tenant-demo demo-owner owner
```

Start the web app (dashboard on `localhost`, storefronts on subdomains):

```bash
pnpm --filter @microstore/web dev
```

Storefronts are served by subdomain: after creating and publishing a store with subdomain `zara`, open
`http://zara.microstore.localhost:3000` (browsers resolve `*.localhost` to your machine). Set `WEB_PORT` if 3000 is taken
and update `STOREFRONT_URL_TEMPLATE`, `CORS_ORIGINS` and `WEB_REVALIDATE_URL` to match.

The API listens on `http://localhost:4000` (`/health`, `/ready`, `/api/v1/...`). With `GETORIO_CLIENT=mock` it uses
the in-memory Getorio with the sample catalog for tenant `tenant-demo`. See [docs/API.md](docs/API.md).

## Scripts

| Command                             | What it does                        |
| ----------------------------------- | ----------------------------------- |
| `pnpm build`                        | Build all packages and apps         |
| `pnpm typecheck`                    | TypeScript check everywhere         |
| `pnpm lint`                         | ESLint                              |
| `pnpm format` / `pnpm format:check` | Prettier                            |
| `pnpm test`                         | Unit tests                          |
| `pnpm test:coverage`                | Unit tests with coverage thresholds |

Run one package: `pnpm --filter @microstore/site-schema test`.

API tests are integration tests: they need MySQL from docker-compose and use `DATABASE_URL_TEST`
(a database ending in `_test`).

## Status

### Phase 1 (MVP) progress

- [x] Monorepo scaffold, Docker Compose (MySQL, Redis, MinIO), `.env.example`, CI, Husky + lint-staged
- [x] `packages/site-schema`: config/section schemas, patch allowlist validator (60+ adversarial tests), migrations, onboarding schema + generator, subdomain rules (100% line coverage)
- [x] `packages/getorio-client`: interface, in-memory mock (fault injection), HTTP client (timeouts, retries, circuit breaker), webhook verification; PHP contract in [docs/GETORIO_API_CONTRACT.md](docs/GETORIO_API_CONTRACT.md)
- [x] `packages/layouts`: registry with 2 layouts (metadata + defaults)
- [x] `apps/api`: Prisma schema (all §7 tables), SSO (JWT) + Redis sessions + CSRF, store onboarding, draft config (PUT/PATCH), publish/unpublish, versions/restore, settings + subdomain change, tenant isolation tests
- [x] `apps/api`: merchant products, public storefront API (host-based tenant resolution, catalog cache with stale fallback, draft preview), COD checkout (idempotent, server-side pricing), BullMQ order sync with retries + sweeper, merchant orders + retry, Getorio webhooks
- [ ] `apps/api`: image uploads (S3/MinIO), confirmation email/SMS adapters
- [x] `packages/layouts`: React components for the 2 layouts (all section types, navbar/footer styles, product card/detail)
- [x] `apps/web` storefront: host-based routing (`proxy.ts`), ISR + on-demand revalidation, draft preview, home/products (search, filter, sort, pagination)/product/content pages, cart, COD checkout, confirmation, SEO (metadata, OG, canonical, JSON-LD, sitemap, robots)
- [x] `apps/web` dashboard: SSO landing, 6-step onboarding with autosave and live subdomain check, overview, design editor with live draft preview (layout, theme, header/footer, pages & sections, SEO, history/restore), publish/unpublish, products, orders with retry, settings
- [ ] Seeds, E2E, Lighthouse
