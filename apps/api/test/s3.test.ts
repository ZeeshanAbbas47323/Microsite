import { describe, expect, it } from 'vitest';
import { S3Storage } from '../src/assets/storage';

const endpoint = process.env.S3_TEST_ENDPOINT ?? 'http://localhost:9000';

async function reachable() {
  try {
    await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!(await reachable()))('S3Storage (local S3 from docker-compose)', () => {
  it('creates the bucket and puts, gets and deletes objects', async () => {
    const storage = new S3Storage({
      endpoint,
      bucket: `ms-test-${Date.now()}`,
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    });
    await storage.put('a/b.webp', new Uint8Array([1, 2, 3]), 'image/webp');
    expect(await storage.get('a/b.webp')).toEqual({
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    });
    await storage.delete(['a/b.webp']);
    await storage.delete([]);
    expect(await storage.get('a/b.webp')).toBeNull();
  });
});
