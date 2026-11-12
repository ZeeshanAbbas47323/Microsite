import { getLayout, isKnownLayout } from '@microstore/layouts';
import {
  applyDraftPatch,
  checkSubdomain,
  generateSiteConfig,
  migrateSiteConfig,
  onboardingInputSchema,
  siteConfigSchema,
  type SiteConfig,
} from '@microstore/site-schema';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import { Prisma, type Domain, type Store } from '../generated/prisma/client';
import { AppError, badRequest, conflict, notFound, zodDetails } from '../lib/errors';
import { newId } from '../lib/ids';
import {
  DEFAULT_STORE_SETTINGS,
  mergeSettings,
  storeSettingsSchema,
  type StoreSettingsPatch,
} from './settings';

export const MAX_DRAFT_REVISIONS = 50;
export const SUBDOMAIN_REDIRECT_DAYS = 30;

/** Purges cached storefront pages (ISR `revalidateTag` in apps/web). */
export interface SiteRevalidator {
  revalidateStore(storeId: string, hostnames: string[]): Promise<void>;
}
export const noopRevalidator: SiteRevalidator = { revalidateStore: async () => {} };

type VersionSource = 'manual' | 'command' | 'publish' | 'restore' | 'generate';
type Tx = Prisma.TransactionClient;
type StoreWithDomains = Store & { domains: Domain[] };

const json = (value: unknown) => value as Prisma.InputJsonValue;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export interface StoreServiceOptions {
  rootDomain: string;
  /** e.g. `https://{host}`; `{host}` is replaced with the store hostname. */
  storefrontUrlTemplate: string;
  revalidator?: SiteRevalidator;
  now?: () => Date;
}

/**
 * Store business logic. Every query is scoped by the caller's Getorio tenant, so a merchant can
 * never read or write another tenant's store (requirements §5); foreign ids look like 404.
 */
export class StoreService {
  private readonly revalidator: SiteRevalidator;
  private readonly now: () => Date;

  constructor(
    private readonly db: Db,
    private readonly options: StoreServiceOptions,
  ) {
    this.revalidator = options.revalidator ?? noopRevalidator;
    this.now = options.now ?? (() => new Date());
  }

  // -- Reads -----------------------------------------------------------------------------

  async findForTenant(tenantId: string) {
    const store = await this.db.store.findUnique({
      where: { getorioTenantId: tenantId },
      include: { domains: true },
    });
    return store ? this.toDto(store) : null;
  }

  async get(tenantId: string, storeId: string) {
    return this.toDto(await this.load(tenantId, storeId));
  }

  async getDraft(tenantId: string, storeId: string) {
    const store = await this.load(tenantId, storeId);
    return {
      config: migrateSiteConfig(store.draftConfig),
      updatedAt: store.updatedAt.toISOString(),
    };
  }

  async listVersions(tenantId: string, storeId: string) {
    await this.load(tenantId, storeId);
    const versions = await this.db.siteVersion.findMany({
      where: { storeId, getorioTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, kind: true, label: true, source: true, createdBy: true, createdAt: true },
    });
    return versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));
  }

  async checkSubdomain(name: string) {
    const check = checkSubdomain(name);
    if (!check.ok)
      return {
        available: false,
        subdomain: check.value,
        reason: check.reason,
        message: check.message,
      };
    const taken = await this.db.domain.findUnique({
      where: { hostname: this.hostnameFor(check.value) },
    });
    return taken
      ? {
          available: false,
          subdomain: check.value,
          reason: 'taken',
          message: 'This name is already taken',
        }
      : { available: true, subdomain: check.value };
  }

  // -- Writes ----------------------------------------------------------------------------

  /** FR-1.5: creates the store, its subdomain and the generated draft config. Not public yet. */
  async create(session: Session, input: unknown) {
    const parsed = onboardingInputSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        400,
        'validation_error',
        'Invalid store details',
        zodDetails(parsed.error),
      );
    const data = parsed.data;
    const layout = getLayout(data.layoutId);
    if (!layout) throw badRequest(`Unknown layout "${data.layoutId}"`);

    if (await this.db.store.findUnique({ where: { getorioTenantId: session.getorioTenantId } })) {
      throw conflict('This account already has a store');
    }
    const hostname = this.hostnameFor(data.subdomain);
    if (await this.db.domain.findUnique({ where: { hostname } })) {
      throw conflict('This subdomain is already taken', { field: 'subdomain' });
    }

    const config = generateSiteConfig(data, layout.defaults, { now: this.now() });
    const storeId = newId();
    const tenantId = session.getorioTenantId;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.store.create({
          data: {
            id: storeId,
            getorioTenantId: tenantId,
            ownerUserId: session.merchantId,
            name: config.business.name,
            settings: json(DEFAULT_STORE_SETTINGS),
            draftConfig: json(config),
          },
        });
        await tx.domain.create({
          data: {
            id: newId(),
            storeId,
            getorioTenantId: tenantId,
            hostname,
            type: 'subdomain',
            verified: true,
            isPrimary: true,
          },
        });
        await this.addVersion(
          tx,
          storeId,
          tenantId,
          'draft_revision',
          config,
          'generate',
          session.merchantId,
        );
        await this.audit(tx, storeId, tenantId, session, 'store.created', {
          subdomain: data.subdomain,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Store or subdomain already exists');
      throw error;
    }
    return this.get(tenantId, storeId);
  }

  async updateSettings(session: Session, storeId: string, patch: StoreSettingsPatch) {
    const tenantId = session.getorioTenantId;
    const store = await this.load(tenantId, storeId);
    const settings = mergeSettings(storeSettingsSchema.parse(store.settings), patch);
    const oldHosts = store.domains.map((d) => d.hostname);

    try {
      await this.db.$transaction(async (tx) => {
        await tx.store.update({ where: { id: store.id }, data: { settings: json(settings) } });
        if (patch.subdomain !== undefined) await this.changeSubdomain(tx, store, patch.subdomain);
        await this.audit(tx, store.id, tenantId, session, 'store.settings_updated', {
          fields: Object.keys(patch),
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('This subdomain is already taken', { field: 'subdomain' });
      throw error;
    }
    if (
      patch.subdomain !== undefined ||
      patch.whatsappButton !== undefined ||
      patch.rtl !== undefined
    ) {
      await this.revalidator.revalidateStore(store.id, oldHosts);
    }
    return this.get(tenantId, storeId);
  }

  async saveDraft(
    session: Session,
    storeId: string,
    input: unknown,
    source: VersionSource = 'manual',
  ) {
    const parsed = siteConfigSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError(400, 'validation_error', 'Invalid site config', zodDetails(parsed.error));
    return this.writeDraft(session, storeId, parsed.data, source);
  }

  async patchDraft(session: Session, storeId: string, patch: unknown) {
    const store = await this.load(session.getorioTenantId, storeId);
    const result = applyDraftPatch(migrateSiteConfig(store.draftConfig), patch);
    if (!result.ok) throw new AppError(400, 'validation_error', result.message, result.issues);
    return this.writeDraft(session, storeId, result.config, 'manual');
  }

  async restoreVersion(session: Session, storeId: string, versionId: string) {
    const tenantId = session.getorioTenantId;
    await this.load(tenantId, storeId);
    const version = await this.db.siteVersion.findFirst({
      where: { id: versionId, storeId, getorioTenantId: tenantId },
    });
    if (!version) throw notFound('Version');
    return this.writeDraft(session, storeId, migrateSiteConfig(version.config), 'restore');
  }

  /** FR-6.7: copies the draft to published and creates an immutable version record. */
  async publish(session: Session, storeId: string) {
    const tenantId = session.getorioTenantId;
    const store = await this.load(tenantId, storeId);
    this.assertNotSuspended(store);
    const config = migrateSiteConfig(store.draftConfig);

    await this.db.$transaction(async (tx) => {
      const versionId = await this.addVersion(
        tx,
        store.id,
        tenantId,
        'published',
        config,
        'publish',
        session.merchantId,
      );
      await tx.store.update({
        where: { id: store.id },
        data: {
          status: 'published',
          publishedConfig: json(config),
          publishedVersionId: versionId,
          publishedAt: this.now(),
          name: config.business.name,
        },
      });
      await this.audit(tx, store.id, tenantId, session, 'store.published', { versionId });
    });
    await this.revalidator.revalidateStore(
      store.id,
      store.domains.map((d) => d.hostname),
    );
    return this.get(tenantId, storeId);
  }

  /** Takes the storefront offline. The published config is kept so it can be re-published. */
  async unpublish(session: Session, storeId: string) {
    const tenantId = session.getorioTenantId;
    const store = await this.load(tenantId, storeId);
    this.assertNotSuspended(store);
    await this.db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: store.id }, data: { status: 'draft' } });
      await this.audit(tx, store.id, tenantId, session, 'store.unpublished', {});
    });
    await this.revalidator.revalidateStore(
      store.id,
      store.domains.map((d) => d.hostname),
    );
    return this.get(tenantId, storeId);
  }

  // -- Internals -------------------------------------------------------------------------

  private hostnameFor(subdomain: string) {
    return `${subdomain}.${this.options.rootDomain}`;
  }

  private async load(tenantId: string, storeId: string): Promise<StoreWithDomains> {
    const store = await this.db.store.findFirst({
      where: { id: storeId, getorioTenantId: tenantId },
      include: { domains: true },
    });
    if (!store) throw notFound('Store');
    return store;
  }

  private assertNotSuspended(store: Store) {
    if (store.status === 'suspended') {
      throw new AppError(403, 'store_suspended', 'This store is suspended. Contact support.');
    }
  }

  private async writeDraft(
    session: Session,
    storeId: string,
    config: SiteConfig,
    source: VersionSource,
  ) {
    const tenantId = session.getorioTenantId;
    if (!isKnownLayout(config.layoutId)) throw badRequest(`Unknown layout "${config.layoutId}"`);
    await this.load(tenantId, storeId);
    await this.db.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data: { draftConfig: json(config) } });
      await this.addVersion(
        tx,
        storeId,
        tenantId,
        'draft_revision',
        config,
        source,
        session.merchantId,
      );
      await this.pruneDraftRevisions(tx, storeId, tenantId);
    });
    return this.getDraft(tenantId, storeId);
  }

  private async addVersion(
    tx: Tx,
    storeId: string,
    tenantId: string,
    kind: 'published' | 'draft_revision',
    config: SiteConfig,
    source: VersionSource,
    createdBy: string,
  ) {
    const id = newId();
    await tx.siteVersion.create({
      data: {
        id,
        storeId,
        getorioTenantId: tenantId,
        kind,
        config: json(config),
        source,
        createdBy,
      },
    });
    return id;
  }

  private async pruneDraftRevisions(tx: Tx, storeId: string, tenantId: string) {
    const stale = await tx.siteVersion.findMany({
      where: { storeId, getorioTenantId: tenantId, kind: 'draft_revision' },
      orderBy: { createdAt: 'desc' },
      skip: MAX_DRAFT_REVISIONS,
      select: { id: true },
    });
    if (stale.length)
      await tx.siteVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
  }

  private async changeSubdomain(tx: Tx, store: StoreWithDomains, requested: string) {
    const check = checkSubdomain(requested);
    if (!check.ok)
      throw new AppError(400, 'validation_error', check.message, {
        field: 'subdomain',
        reason: check.reason,
      });
    const hostname = this.hostnameFor(check.value);
    const current = store.domains.find((d) => d.isPrimary && d.type === 'subdomain');
    if (current?.hostname === hostname) return;

    // Re-claiming one of this store's own old subdomains: make it primary again.
    const own = store.domains.find((d) => d.hostname === hostname);
    const newDomainId = own?.id ?? newId();
    if (own) {
      await tx.domain.update({
        where: { id: own.id },
        data: { isPrimary: true, redirectToDomainId: null, redirectExpiresAt: null },
      });
    } else {
      await tx.domain.create({
        data: {
          id: newDomainId,
          storeId: store.id,
          getorioTenantId: store.getorioTenantId,
          hostname,
          type: 'subdomain',
          verified: true,
          isPrimary: true,
        },
      });
    }
    const expires = new Date(this.now().getTime() + SUBDOMAIN_REDIRECT_DAYS * 24 * 60 * 60 * 1000);
    await tx.domain.updateMany({
      where: { storeId: store.id, type: 'subdomain', id: { not: newDomainId } },
      data: { isPrimary: false, redirectToDomainId: newDomainId, redirectExpiresAt: expires },
    });
  }

  private async audit(
    tx: Tx,
    storeId: string,
    tenantId: string,
    session: Session,
    action: string,
    metadata: object,
  ) {
    await tx.auditLog.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: tenantId,
        actor: `merchant:${session.merchantId}`,
        action,
        metadata: json(metadata),
      },
    });
  }

  private toDto(store: StoreWithDomains) {
    const primary = store.domains.find((d) => d.isPrimary) ?? null;
    return {
      id: store.id,
      name: store.name,
      status: store.status,
      currency: store.currency,
      timezone: store.timezone,
      subdomain: primary ? primary.hostname.slice(0, -(this.options.rootDomain.length + 1)) : null,
      hostname: primary?.hostname ?? null,
      url: primary ? this.options.storefrontUrlTemplate.replace('{host}', primary.hostname) : null,
      settings: storeSettingsSchema.parse(store.settings),
      layoutId: (store.draftConfig as { layoutId?: string }).layoutId ?? null,
      hasUnpublishedChanges:
        store.publishedConfig === null ||
        JSON.stringify(store.draftConfig) !== JSON.stringify(store.publishedConfig),
      publishedAt: store.publishedAt?.toISOString() ?? null,
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString(),
    };
  }
}

export type StoreDto = Awaited<ReturnType<StoreService['get']>>;
