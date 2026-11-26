import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import { AppError, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { SiteRevalidator, StoreService } from './store-service';

/** The DNS lookups domain verification needs; swapped for a fake in tests. */
export interface DnsLookup {
  resolve4(hostname: string): Promise<string[]>;
  resolveCname(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}

/** Public resolvers, so a merchant's fresh records are seen without our host's cache. */
export function createDnsLookup(timeoutMs = 4000): DnsLookup {
  const resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  return resolver;
}

export interface DomainOptions {
  rootDomain: string;
  /** Server IPv4 address(es) custom domains point their A record at. */
  targetIps: string[];
  /** Hostname custom subdomains (www.…) point their CNAME at. */
  cnameTarget: string;
  storefrontUrlTemplate: string;
}

export const MAX_CUSTOM_DOMAINS = 3;
/** TXT record name prefix that proves ownership. */
export const VERIFY_PREFIX = '_getorio-verify';

/** Two-level public suffixes common for our merchants; good enough to tell apex from subdomain. */
const TWO_LEVEL_SUFFIXES = new Set([
  'com.pk',
  'net.pk',
  'org.pk',
  'edu.pk',
  'gov.pk',
  'web.pk',
  'biz.pk',
  'co.uk',
  'org.uk',
  'com.au',
  'co.in',
  'com.sa',
  'co.ae',
]);

/** True for `brand.com` / `brand.com.pk`, false for `shop.brand.com`. */
export function isApex(hostname: string): boolean {
  const labels = hostname.split('.');
  const suffix = labels.slice(-2).join('.');
  return labels.length === (TWO_LEVEL_SUFFIXES.has(suffix) ? 3 : 2);
}

/** Normalises what a merchant typed ("https://www.Brand.pk/") into a hostname, or explains why not. */
export function parseCustomHostname(
  input: string,
  rootDomain: string,
): { ok: true; hostname: string } | { ok: false; message: string } {
  const hostname = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const labels = hostname.split('.');
  if (
    !hostname ||
    hostname.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => label.test(l)) ||
    !/[a-z]/.test(labels.at(-1) ?? '')
  ) {
    return { ok: false, message: 'Enter a domain like brand.pk or shop.brand.com' };
  }
  if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
    return { ok: false, message: `Use the subdomain setting for ${rootDomain} addresses` };
  }
  return { ok: true, hostname };
}

export interface DnsCheck {
  /** `ownership` (TXT) or `routing` (A or CNAME). */
  key: 'ownership' | 'routing';
  ok: boolean;
  /** What we found, for the merchant ("A 203.0.113.10"). */
  found: string[];
}

type DomainRow = Awaited<ReturnType<Db['domain']['findMany']>>[number];

/**
 * Phase 4 custom domains (FR-9.3). A merchant adds a domain, puts a TXT record (ownership) and an
 * A record or CNAME (routing) at their DNS provider, then verifies. Only verified domains resolve
 * to the store (see `resolveStoreByHost`), and only verified domains get a TLS certificate.
 */
export class DomainService {
  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
    private readonly dns: DnsLookup,
    private readonly revalidator: SiteRevalidator,
    private readonly options: DomainOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(tenantId: string, storeId: string) {
    await this.stores.get(tenantId, storeId); // ownership check
    const domains = await this.db.domain.findMany({
      where: { storeId, getorioTenantId: tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const now = this.now();
    const subdomains = domains.filter((d) => d.type === 'subdomain');
    const active = subdomains.find((d) => !d.redirectToDomainId) ?? null;
    return {
      subdomain: active ? this.dto(active) : null,
      /** Old subdomains still redirecting (FR-6.6). */
      redirects: subdomains
        .filter((d) => d.redirectToDomainId && d.redirectExpiresAt && d.redirectExpiresAt > now)
        .map((d) => ({ hostname: d.hostname, until: d.redirectExpiresAt?.toISOString() ?? null })),
      domains: domains.filter((d) => d.type === 'custom').map((d) => this.dto(d)),
      rootDomain: this.options.rootDomain,
      target: { ips: this.options.targetIps, cname: this.options.cnameTarget },
      limit: MAX_CUSTOM_DOMAINS,
    };
  }

  async add(session: Session, storeId: string, input: string) {
    const tenantId = session.getorioTenantId;
    await this.stores.get(tenantId, storeId);
    const parsed = parseCustomHostname(input, this.options.rootDomain);
    if (!parsed.ok)
      throw new AppError(400, 'validation_error', parsed.message, { field: 'hostname' });
    const existing = await this.db.domain.findUnique({ where: { hostname: parsed.hostname } });
    if (existing) {
      throw conflict(
        existing.storeId === storeId
          ? 'This domain is already connected to your store'
          : 'This domain is connected to another store',
        { field: 'hostname' },
      );
    }
    const count = await this.db.domain.count({ where: { storeId, type: 'custom' } });
    if (count >= MAX_CUSTOM_DOMAINS) {
      throw new AppError(409, 'conflict', `You can connect up to ${MAX_CUSTOM_DOMAINS} domains`);
    }
    const domain = await this.db.domain.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: tenantId,
        hostname: parsed.hostname,
        type: 'custom',
        verified: false,
        isPrimary: false,
        verificationToken: `getorio-${randomBytes(12).toString('hex')}`,
      },
    });
    await this.audit(session, storeId, 'domain.added', { hostname: domain.hostname });
    return this.dto(domain);
  }

  /** Looks the records up and marks the domain verified when both checks pass. */
  async verify(session: Session, storeId: string, domainId: string) {
    const domain = await this.custom(session.getorioTenantId, storeId, domainId);
    const checks = await this.check(domain);
    const ok = checks.every((c) => c.ok);
    const failed = checks.filter((c) => !c.ok).map((c) => c.key);
    const updated = await this.db.domain.update({
      where: { id: domain.id },
      data: {
        lastCheckedAt: this.now(),
        lastCheckError: ok ? null : `Missing or wrong ${failed.join(' and ')} record`,
        // A verified domain stays verified on a failed re-check so a DNS blip never takes a
        // live store offline; the merchant sees the warning instead.
        ...(ok && !domain.verified ? { verified: true, verifiedAt: this.now() } : {}),
      },
    });
    if (ok && !domain.verified) {
      await this.audit(session, storeId, 'domain.verified', { hostname: domain.hostname });
      await this.revalidator.revalidateStore(storeId, [domain.hostname]);
    }
    return { domain: this.dto(updated), checks };
  }

  /** Customers are sent to the primary domain; the others redirect to it. */
  async makePrimary(session: Session, storeId: string, domainId: string) {
    const tenantId = session.getorioTenantId;
    await this.stores.get(tenantId, storeId);
    const domains = await this.db.domain.findMany({
      where: { storeId, getorioTenantId: tenantId },
    });
    const target = domains.find((d) => d.id === domainId && !d.redirectToDomainId);
    if (!target) throw notFound('Domain');
    if (!target.verified) {
      throw new AppError(409, 'conflict', 'Verify the domain before making it primary');
    }
    await this.db.$transaction([
      this.db.domain.updateMany({ where: { storeId }, data: { isPrimary: false } }),
      this.db.domain.update({ where: { id: target.id }, data: { isPrimary: true } }),
    ]);
    await this.audit(session, storeId, 'domain.primary_changed', { hostname: target.hostname });
    await this.revalidator.revalidateStore(
      storeId,
      domains.map((d) => d.hostname),
    );
    return this.list(tenantId, storeId);
  }

  async remove(session: Session, storeId: string, domainId: string) {
    const tenantId = session.getorioTenantId;
    const domain = await this.custom(tenantId, storeId, domainId);
    await this.db.$transaction(async (tx) => {
      await tx.domain.delete({ where: { id: domain.id } });
      if (domain.isPrimary) {
        // Fall back to the store's own subdomain.
        await tx.domain.updateMany({
          where: { storeId, type: 'subdomain', redirectToDomainId: null },
          data: { isPrimary: true },
        });
      }
    });
    await this.audit(session, storeId, 'domain.removed', { hostname: domain.hostname });
    await this.revalidator.revalidateStore(storeId, [domain.hostname]);
    return this.list(tenantId, storeId);
  }

  /** For the TLS server's on-demand "may I get a certificate for this host?" question. */
  async allowsCertificate(hostname: string): Promise<boolean> {
    if (hostname.endsWith(`.${this.options.rootDomain}`)) return true;
    const domain = await this.db.domain.findUnique({ where: { hostname } });
    return Boolean(domain && domain.type === 'custom' && domain.verified);
  }

  private async check(domain: DomainRow): Promise<DnsCheck[]> {
    const safe = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [txt, a, cname] = await Promise.all([
      safe(this.dns.resolveTxt(`${VERIFY_PREFIX}.${domain.hostname}`)),
      safe(this.dns.resolve4(domain.hostname)),
      safe(this.dns.resolveCname(domain.hostname)),
    ]);
    const txtValues = txt.map((chunks) => chunks.join(''));
    const cnameTarget = this.options.cnameTarget.toLowerCase();
    const cnameOk = cname.some((c) => c.toLowerCase().replace(/\.$/, '') === cnameTarget);
    // A CNAME to us resolves to our IPs as well; accept either path.
    const aOk = a.length > 0 && a.every((ip) => this.options.targetIps.includes(ip));
    return [
      {
        key: 'ownership',
        ok: Boolean(domain.verificationToken && txtValues.includes(domain.verificationToken)),
        found: txtValues.map((v) => `TXT ${v}`),
      },
      {
        key: 'routing',
        ok: cnameOk || aOk,
        found: [...cname.map((c) => `CNAME ${c}`), ...a.map((ip) => `A ${ip}`)],
      },
    ];
  }

  private async custom(tenantId: string, storeId: string, domainId: string) {
    await this.stores.get(tenantId, storeId);
    const domain = await this.db.domain.findFirst({
      where: { id: domainId, storeId, getorioTenantId: tenantId, type: 'custom' },
    });
    if (!domain) throw notFound('Domain');
    return domain;
  }

  private dto(d: DomainRow) {
    return {
      id: d.id,
      hostname: d.hostname,
      type: d.type,
      apex: d.type === 'custom' ? isApex(d.hostname) : false,
      verified: d.verified,
      isPrimary: d.isPrimary,
      status: d.verified
        ? d.lastCheckError
          ? ('attention' as const)
          : ('active' as const)
        : ('pending' as const),
      url: this.options.storefrontUrlTemplate.replace('{host}', d.hostname),
      verification:
        d.type === 'custom' && d.verificationToken
          ? { name: `${VERIFY_PREFIX}.${d.hostname}`, value: d.verificationToken }
          : null,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
      lastCheckError: d.lastCheckError,
      createdAt: d.createdAt.toISOString(),
    };
  }

  private async audit(session: Session, storeId: string, action: string, metadata: object) {
    await this.db.auditLog.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: session.getorioTenantId,
        actor: `merchant:${session.merchantId}`,
        action,
        metadata: JSON.parse(JSON.stringify(metadata)),
      },
    });
  }
}
