import type { Db } from '../db';
import { newId } from '../lib/ids';
import type { SsoClaims } from './sso';

/** Creates or refreshes the local mapping of a Getorio user (requirements §5). */
export async function upsertMerchant(db: Db, claims: SsoClaims, now = new Date()) {
  return db.merchant.upsert({
    where: {
      getorioTenantId_getorioUserId: {
        getorioTenantId: claims.getorioTenantId,
        getorioUserId: claims.getorioUserId,
      },
    },
    create: {
      id: newId(),
      getorioTenantId: claims.getorioTenantId,
      getorioUserId: claims.getorioUserId,
      role: claims.role,
      lastLoginAt: now,
    },
    update: { role: claims.role, lastLoginAt: now },
  });
}
