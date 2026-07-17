import { nowIso } from "@knowget/shared";
import {
  type BlobMetadata,
  type BlobStore,
  checksumOf,
  DEFAULT_CONTENT_TYPE,
  type PutOptions,
} from "./blob-store";

interface StoredBlob {
  readonly data: Buffer;
  readonly meta: BlobMetadata;
}

/** In-memory {@link BlobStore} — ideal for tests and ephemeral caches. */
export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  async put(key: string, data: Buffer, options: PutOptions = {}): Promise<BlobMetadata> {
    const meta: BlobMetadata = {
      key,
      size: data.byteLength,
      contentType: options.contentType ?? DEFAULT_CONTENT_TYPE,
      checksum: checksumOf(data),
      createdAt: nowIso(),
    };
    // Copy so later external mutation of the caller's buffer cannot alter storage.
    this.blobs.set(key, { data: Buffer.from(data), meta });
    return meta;
  }

  async get(key: string): Promise<Buffer | null> {
    const blob = this.blobs.get(key);
    return blob ? Buffer.from(blob.data) : null;
  }

  async stat(key: string): Promise<BlobMetadata | null> {
    return this.blobs.get(key)?.meta ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return this.blobs.has(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.blobs.delete(key);
  }

  async list(prefix?: string): Promise<readonly BlobMetadata[]> {
    const all = [...this.blobs.values()].map((b) => b.meta);
    return prefix ? all.filter((m) => m.key.startsWith(prefix)) : all;
  }
}
