import type { GetorioClient } from './client';
import { HttpGetorioClient } from './http/http-client';
import { createSampleCatalog, SAMPLE_TENANT_ID } from './mock/catalog';
import { InMemoryGetorioClient } from './mock/in-memory-client';

export interface GetorioClientEnv {
  GETORIO_CLIENT?: string;
  GETORIO_API_BASE_URL?: string;
  GETORIO_API_KEY?: string;
  NODE_ENV?: string;
}

/**
 * Picks the implementation from env: `GETORIO_CLIENT=mock` (default outside production) or `http`.
 * The mock gives every tenant the sample catalog (dev only).
 */
export function createGetorioClient(env: GetorioClientEnv): GetorioClient {
  const kind = env.GETORIO_CLIENT ?? (env.NODE_ENV === 'production' ? 'http' : 'mock');
  if (kind === 'mock') {
    if (env.NODE_ENV === 'production')
      throw new Error('The Getorio mock client cannot be used in production');
    // Every tenant gets the sample catalog so any dev sign-in has products to sell.
    return new InMemoryGetorioClient({
      catalog: { [SAMPLE_TENANT_ID]: createSampleCatalog() },
      catalogForNewTenants: () => createSampleCatalog(),
    });
  }
  if (kind === 'http') {
    return new HttpGetorioClient({
      baseUrl: env.GETORIO_API_BASE_URL ?? '',
      apiKey: env.GETORIO_API_KEY ?? '',
    });
  }
  throw new Error(`Unknown GETORIO_CLIENT "${kind}" (expected "mock" or "http")`);
}
