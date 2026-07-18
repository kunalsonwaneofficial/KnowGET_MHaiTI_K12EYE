import { PrismaService } from "@knowget/database";
import {
  type BlobMetadata,
  type BlobStore,
  checksumOf,
  DEFAULT_CONTENT_TYPE,
  type PutOptions,
} from "@knowget/files";
import { toIso } from "@knowget/shared";

interface BlobRow {
  key: string;
  contentType: string;
  checksum: string;
  size: number;
  createdAt: Date;
}

const METADATA_SELECT = {
  key: true,
  contentType: true,
  checksum: true,
  size: true,
  createdAt: true,
} as const;

function toMetadata(row: BlobRow): BlobMetadata {
  return {
    key: row.key,
    size: row.size,
    contentType: row.contentType,
    checksum: row.checksum,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * PostgreSQL-backed {@link BlobStore} (TD-19): a shared, replica-agnostic object
 * store — bytes in a `bytea` column, keyed globally. Not tenant-scoped (the port
 * is tenant-agnostic; callers namespace keys). `get`/`stat` return `null` for a
 * missing key. Selected by `SERVICES_STORE=persisted`.
 */
export class PrismaBlobStore implements BlobStore {
  constructor(private readonly db: PrismaService) {}

  async put(key: string, data: Buffer, options?: PutOptions): Promise<BlobMetadata> {
    // Prisma's `Bytes` input is `Uint8Array<ArrayBuffer>`, but a Node `Buffer` is
    // typed `Buffer<ArrayBufferLike>` (its backing store may be a `SharedArrayBuffer`).
    // Copy into a plain `ArrayBuffer`-backed view so the write is well-typed.
    const bytes = new Uint8Array(data);
    const fields = {
      contentType: options?.contentType ?? DEFAULT_CONTENT_TYPE,
      checksum: checksumOf(data),
      size: data.byteLength,
      data: bytes,
    };
    const row = await this.db.client.serviceBlob.upsert({
      where: { key },
      create: { key, ...fields },
      update: fields,
      select: METADATA_SELECT,
    });
    return toMetadata(row);
  }

  async get(key: string): Promise<Buffer | null> {
    const row = await this.db.client.serviceBlob.findUnique({
      where: { key },
      select: { data: true },
    });
    return row ? Buffer.from(row.data) : null;
  }

  async stat(key: string): Promise<BlobMetadata | null> {
    const row = await this.db.client.serviceBlob.findUnique({
      where: { key },
      select: METADATA_SELECT,
    });
    return row ? toMetadata(row) : null;
  }

  async exists(key: string): Promise<boolean> {
    const row = await this.db.client.serviceBlob.findUnique({
      where: { key },
      select: { key: true },
    });
    return row !== null;
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.db.client.serviceBlob.deleteMany({ where: { key } });
    return result.count > 0;
  }

  async list(prefix?: string): Promise<readonly BlobMetadata[]> {
    const rows = await this.db.client.serviceBlob.findMany({
      where: prefix ? { key: { startsWith: prefix } } : {},
      select: METADATA_SELECT,
      orderBy: { key: "asc" },
    });
    return rows.map(toMetadata);
  }
}
