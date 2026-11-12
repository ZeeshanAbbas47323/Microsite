import sharp, { type OutputInfo } from 'sharp';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { StoreService } from '../stores/store-service';
import type { ObjectStorage } from './storage';

/** FR-6.8 limits. */
export const DEFAULT_STORE_QUOTA_BYTES = 200 * 1024 * 1024;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const MAX_INPUT_PIXELS = 40_000_000;

export type AssetPurpose = 'logo' | 'image';

/** Formats accepted after sniffing the real bytes (never trusting the file name or MIME header). */
const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

/** Public path the storefront and dashboard use; served by apps/web from the API (`/media/...`). */
export const mediaPath = (key: string) => `/media/${key}`;

export interface AssetDto {
  id: string;
  url: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/**
 * Image uploads: validates by magic bytes, re-encodes to WebP (which strips EXIF/GPS and any
 * embedded scripts), caps the size and enforces a per-store quota.
 * SVG is accepted only for logos and is rasterized, so no SVG is ever served.
 */
export class AssetService {
  constructor(
    private readonly db: Db,
    private readonly storage: ObjectStorage,
    private readonly stores: StoreService,
    private readonly quotaBytes = DEFAULT_STORE_QUOTA_BYTES,
  ) {}

  async upload(
    session: Session,
    storeId: string,
    file: Buffer,
    purpose: AssetPurpose,
  ): Promise<AssetDto> {
    const tenantId = session.getorioTenantId;
    await this.stores.get(tenantId, storeId);

    const maxBytes = purpose === 'logo' ? MAX_LOGO_BYTES : MAX_IMAGE_BYTES;
    if (file.length === 0) throw new AppError(400, 'validation_error', 'The file is empty');
    if (file.length > maxBytes) {
      throw new AppError(
        400,
        'validation_error',
        `The file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`,
      );
    }

    let format: string | undefined;
    try {
      format = (await sharp(file, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
    } catch {
      format = undefined;
    }
    const isSvg = format === 'svg';
    if (!format || (!RASTER_FORMATS.has(format) && !isSvg)) {
      throw new AppError(400, 'validation_error', 'Only JPG, PNG, WebP or GIF images are allowed');
    }
    if (isSvg && purpose !== 'logo') {
      throw new AppError(400, 'validation_error', 'SVG files are only allowed for the logo');
    }

    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await sharp(file, {
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
        density: isSvg ? 144 : undefined,
      })
        .rotate() // apply EXIF orientation before the metadata is dropped
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new AppError(400, 'validation_error', 'This image could not be read');
    }

    const store = await this.db.store.findFirstOrThrow({
      where: { id: storeId, getorioTenantId: tenantId },
    });
    if (Number(store.storageUsedBytes) + output.data.length > this.quotaBytes) {
      throw new AppError(409, 'conflict', 'Storage limit reached. Delete some images first.');
    }

    const id = newId();
    const key = `stores/${storeId}/${id}.webp`;
    await this.storage.put(key, output.data, 'image/webp');
    try {
      const asset = await this.db.$transaction(async (tx) => {
        await tx.store.update({
          where: { id: storeId },
          data: { storageUsedBytes: { increment: output.data.length } },
        });
        return tx.asset.create({
          data: {
            id,
            storeId,
            getorioTenantId: tenantId,
            url: mediaPath(key),
            key,
            mime: 'image/webp',
            sizeBytes: output.data.length,
            width: output.info.width,
            height: output.info.height,
          },
        });
      });
      return toDto(asset);
    } catch (error) {
      await this.storage.delete([key]).catch(() => undefined);
      throw error;
    }
  }

  async list(tenantId: string, storeId: string) {
    await this.stores.get(tenantId, storeId);
    const [rows, store] = await Promise.all([
      this.db.asset.findMany({
        where: { storeId, getorioTenantId: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.store.findFirstOrThrow({ where: { id: storeId, getorioTenantId: tenantId } }),
    ]);
    return {
      items: rows.map(toDto),
      usedBytes: Number(store.storageUsedBytes),
      quotaBytes: this.quotaBytes,
    };
  }

  async remove(tenantId: string, storeId: string, assetId: string) {
    const asset = await this.db.asset.findFirst({
      where: { id: assetId, storeId, getorioTenantId: tenantId },
    });
    if (!asset) throw notFound('Image');
    await this.db.$transaction(async (tx) => {
      await tx.asset.delete({ where: { id: asset.id } });
      await tx.store.update({
        where: { id: storeId },
        data: { storageUsedBytes: { decrement: asset.sizeBytes } },
      });
    });
    await this.storage.delete([asset.key]);
  }

  /** Public read for `/media/...`. Only keys that belong to an asset row are served. */
  async read(key: string) {
    if (!/^stores\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(key)) return null;
    const asset = await this.db.asset.findFirst({ where: { key }, select: { id: true } });
    if (!asset) return null;
    return this.storage.get(key);
  }
}

function toDto(a: {
  id: string;
  url: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}): AssetDto {
  return {
    id: a.id,
    url: a.url,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt.toISOString(),
  };
}
