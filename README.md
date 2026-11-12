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
docker compose up -d mysql redis s3
```

This starts MySQL 8, Redis and an S3-compatible store for uploads (SeaweedFS on `:9000`).
If port 3306, 6379 or 9000 is already taken on your machine, set `MYSQL_PORT` / `REDIS_PORT` / `S3_PORT` in `.env` (and the matching
ports in `DATABASE_URL`, `DATABASE_URL_TEST`, `REDIS_URL`).

```bash
pnpm build
```

```bash
pnpm --filter @microstore/api db:deploy
```

Optional: a sample published store ("Demo Bazaar") to look around with:

```bash
pnpm --filter @microstore/api db:seed
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

### Phase 1 (MVP): done

All Phase 1 acceptance criteria pass. See [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md) for the results and what is
left for later phases.

## Testing

| What                                                          | Command                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unit + integration (needs MySQL/Redis/S3 from docker-compose) | `pnpm test` / `pnpm test:coverage`                                                         |
| End-to-end (needs a running stack)                            | `pnpm --filter @microstore/e2e e2e:install` once, then `pnpm --filter @microstore/e2e e2e` |
| E2E against Docker                                            | `E2E_BASE_URL=http://localhost:3000 pnpm --filter @microstore/e2e e2e`                     |
| Load test (k6 in Docker)                                      | see the header of [load/storefront.js](load/storefront.js)                                 |

## Running everything in Docker

```bash
docker compose --profile app up --build
```

Runs migrations, the API, the order-sync worker and the web app. Dashboard: `http://localhost:${WEB_PORT:-3000}`,
storefronts: `http://<subdomain>.microstore.localhost:${WEB_PORT:-3000}`. Sign-in links:
`SSO_SHARED_SECRET=<value used by the container> pnpm --filter @microstore/api dev:sso-link <tenant>`.

## Operations

- Health: `GET /health`, readiness: `GET /ready` (API).
- Metrics: `GET /metrics` with `Authorization: Bearer $METRICS_TOKEN` (Prometheus format).
- Errors: set `SENTRY_DSN` (API and worker).
- Order emails: set `SMTP_URL` and `MAIL_FROM`; SMS/WhatsApp hook: `MESSAGE_WEBHOOK_URL` + `MESSAGE_WEBHOOK_TOKEN`.
- Bot check on checkout: `TURNSTILE_SECRET` (API) + `TURNSTILE_SITE_KEY` (web).
