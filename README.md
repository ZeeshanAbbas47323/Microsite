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
apps/web               Next.js: merchant dashboard + public storefront   (not started)
apps/api               Fastify API + workers                              (not started)
packages/site-schema   Zod schemas, types, patch allowlist, migrations    (done)
packages/layouts       Layout definitions + section components            (not started)
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

This starts MySQL 8 (`:3306`), Redis (`:6379`) and MinIO (`:9000`, console `:9001`) and creates the uploads bucket.

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

## Status

### Phase 1 (MVP) progress

- [x] Monorepo scaffold, Docker Compose (MySQL, Redis, MinIO), `.env.example`, CI, Husky + lint-staged
- [x] `packages/site-schema`: config/section schemas, patch allowlist validator (60+ adversarial tests), migrations, onboarding schema + generator, subdomain rules (100% line coverage)
- [x] `packages/getorio-client`: interface, in-memory mock (fault injection), HTTP client (timeouts, retries, circuit breaker), webhook verification; PHP contract in [docs/GETORIO_API_CONTRACT.md](docs/GETORIO_API_CONTRACT.md)
- [ ] `apps/api`: Prisma schema, SSO stub, stores/config/publish, checkout + order sync
- [ ] `packages/layouts`: 2 layouts
- [ ] `apps/web`: onboarding, dashboard, storefront, tenant routing
- [ ] Seeds, E2E, Lighthouse
