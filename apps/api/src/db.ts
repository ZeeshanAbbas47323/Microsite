import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

export type Db = PrismaClient;

/** Prisma over the MariaDB driver adapter, which also speaks MySQL 8. */
export function createDb(databaseUrl: string): Db {
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: Number(url.searchParams.get('connection_limit') ?? 10),
    // MySQL 8 caching_sha2_password over a non-TLS local connection needs the server key.
    allowPublicKeyRetrieval: url.hostname === 'localhost' || url.hostname === '127.0.0.1',
    timezone: 'Z',
  });
  return new PrismaClient({ adapter });
}
