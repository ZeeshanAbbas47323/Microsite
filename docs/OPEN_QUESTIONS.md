# Open questions

Questions for the product / Getorio PHP team. Each has a reversible default in place.

| #    | Question                                                                                                                  | Current default                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Q-1  | SSO mechanism with the PHP system (spec §5). Shared secret HS256 or RS256 key pair? Who issues tokens?                    | JWT via `AuthProvider` interface, HS256 shared secret in dev, RS256 supported. |
| Q-2  | Getorio API endpoints and auth (spec §6).                                                                                 | To be written up in `docs/GETORIO_API_CONTRACT.md`; mock client used locally.  |
| Q-3  | Should the merchant be able to have more than one custom page (e.g. FAQ **and** Policies) instead of About/Contact?       | One page per template (max 5 total).                                           |
| Q-4  | Should `about` / `contact` slugs be fixed (`/about`, `/contact`) for simpler links, or editable for SEO?                  | Editable, but not reserved routes.                                             |
| Q-5  | Which business categories should onboarding offer? Should they map to Getorio categories?                                 | Fixed list of 8 in `generator.ts`.                                             |
| Q-6  | Fonts: is `Noto Nastaliq Urdu` enough for Urdu stores, or should the whitelist include more Urdu/Arabic fonts?            | 10 fonts incl. Noto Nastaliq Urdu.                                             |
| Q-7  | Landline numbers (e.g. `042XXXXXXXX`) for store contact: allowed? Spec lists only mobile formats.                         | Mobile only.                                                                   |
| Q-8  | Which payment gateway is first in Phase 3?                                                                                | Not started (COD only).                                                        |
| Q-9  | Does Getorio support product variants today, and how are variant prices/stock stored?                                     | Optional `variants[]` with own price and stock.                                |
| Q-10 | Getorio's internal order statuses: how do they map to the 7 statuses in the contract?                                     | Mapping to be done on the PHP side.                                            |
| Q-11 | Will Getorio host product images on its own CDN (https), or should Microstore copy them to its own storage?               | Use Getorio's URLs directly.                                                   |
| Q-12 | Can a Getorio tenant ever need more than one microstore?                                                                  | One store per tenant.                                                          |
| Q-13 | Which Getorio staff roles may edit or publish the store?                                                                  | Owner and staff have the same rights.                                          |
| Q-14 | Should concurrent edits of the draft (two tabs/people) be detected (ETag / revision check)?                               | Last write wins.                                                               |
| Q-15 | Is exposing Getorio product ids in storefront URLs/cart acceptable, or should Microstore use its own slugs/ids?           | Getorio ids, no tenant ids.                                                    |
| Q-16 | Should checkout reject when stock cannot be verified (Getorio down), instead of accepting with a `stock_unverified` flag? | Accept + flag (spec §9.3).                                                     |
| Q-17 | Where should order-sync alerts go (email, Slack, pager)?                                                                  | Error log with `alert: true`.                                                  |
| Q-18 | Should unavailable stores show a store-branded page (name/logo) instead of the generic 404?                               | Generic 404 page.                                                              |
| Q-19 | Where will Getorio product images be hosted (to add to `IMAGE_HOSTS`)?                                                    | Placeholder host only.                                                         |
