# @microstore/site-schema

Single source of truth for the Microstore **site config**: Zod schemas, TypeScript types, the
command-box patch allowlist, schema migrations, the onboarding form schema and the initial config generator.

```ts
import {
  siteConfigSchema,
  type SiteConfig, // config schema + type
  migrateSiteConfig, // use on every config read from the DB
  validateCommandPatch, // the ONLY way LLM output may touch a config
  onboardingInputSchema,
  generateSiteConfig,
  checkSubdomain,
} from '@microstore/site-schema';
```

## Modules

| File            | Purpose                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `constants.ts`  | Enums, font whitelist, limits, reserved slugs/subdomains, schema version                                                                   |
| `primitives.ts` | Plain text, hex color, safe link/image URL, PK phone, social URL schemas; `sanitizePlainText`                                              |
| `sections.ts`   | Strict props schema for each section type (`hero`, `productGrid`, `richText`, `imageText`, `contactInfo`, `faq`, `testimonials`, `banner`) |
| `config.ts`     | Theme, navbar, footer, business, page and full site config schemas with cross-field rules                                                  |
| `patch.ts`      | `validateCommandPatch(config, patch, scope?)` — default-deny JSON Patch allowlist (FR-7.3/7.4)                                             |
| `migrate.ts`    | Version check + migration chain (`MIGRATIONS`)                                                                                             |
| `generator.ts`  | Onboarding input schema, `generateSiteConfig`, `switchLayout`                                                                              |
| `subdomain.ts`  | Subdomain rules (FR-1.4)                                                                                                                   |
| `contrast.ts`   | WCAG contrast helpers                                                                                                                      |

## Command patches

`validateCommandPatch` accepts raw model output and returns either
`{ ok: true, patch, config, warnings }` (sanitized patch + resulting config) or `{ ok: false, errors }`.

- Only `replace` on allowlisted scalar paths, `move` of sections within the same page, and `test`.
- Values are checked per path (hex colors, font whitelist, enums, booleans, sanitized plain text).
- The resulting config is re-validated against `siteConfigSchema`. Any failure rejects the whole patch.
- `describeAllowedPaths()` lists the allowlist for building the LLM system prompt.

## Adding a schema version

1. Change the schemas and bump `CURRENT_SCHEMA_VERSION`.
2. Register `MIGRATIONS[oldVersion] = (config) => newConfig` in `migrate.ts`.
3. Add a test that migrates a stored old config.

## Scripts

```bash
pnpm --filter @microstore/site-schema test:coverage
pnpm --filter @microstore/site-schema build
```
