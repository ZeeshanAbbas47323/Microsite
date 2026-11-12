# @microstore/getorio-client

Everything Microstore needs from the Getorio OMS, behind one interface (`GetorioClient`). **Server-side only**:
the HTTP client holds the service API key.

```ts
import { createGetorioClient, isGetorioError } from '@microstore/getorio-client';

const getorio = createGetorioClient(process.env); // GETORIO_CLIENT=mock | http

try {
  await getorio.createOrder(tenantId, payload, idempotencyKey);
} catch (err) {
  if (isGetorioError(err) && err.retryable) {
    // leave the order in pending_sync; the sync job retries later
  }
}
```

| Export                                          | Purpose                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetorioClient`                                 | The interface (spec §6)                                                                                                                      |
| `InMemoryGetorioClient`                         | Mock for dev/tests: tenant isolation, idempotent orders, stock decrement, `setAvailable(false)` / `failNext(n)` fault injection, `calls` log |
| `createSampleCatalog`, `SAMPLE_TENANT_ID`       | 12 deterministic PKR products (incl. variants, out-of-stock, hidden, inactive)                                                               |
| `HttpGetorioClient`                             | Real client: 5 s timeout, retries with jittered backoff, circuit breaker, Zod-validated responses                                            |
| `GetorioError`                                  | `kind` (`unavailable`, `unauthorized`, `not_found`, `conflict`, `rejected`, `invalid_response`) and `retryable`                              |
| `verifyWebhook`, `signWebhookPayload`           | HMAC webhook signatures with replay window                                                                                                   |
| `toMinorUnits`, `fromMinorUnits`, `moneySchema` | Decimal-string money helpers                                                                                                                 |

The HTTP contract the PHP team implements is in [docs/GETORIO_API_CONTRACT.md](../../docs/GETORIO_API_CONTRACT.md).
