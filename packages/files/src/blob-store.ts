import { createHash } from "node:crypto";
import type { ISODateString } from "@knowget/types";

/** Metadata describing a stored blob. */
export interface BlobMetadata {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  /** Lowercase hex SHA-256 of the content (integrity + dedup). */
  readonly checksum: string;
  readonly createdAt: ISODateString;
}

export interface PutOptions {
  readonly contentType?: string;
}

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Provider-agnostic blob storage. Phase-1 ships in-memory and node-filesystem
 * implementations; an object store (S3/GCS/Azure Blob) slots in behind this
 * same contract. `get`/`stat` return `null` for a missing key rather than
 * throwing, so callers branch explicitly.
 */
export interface BlobStore {
  put(key: string, data: Buffer, options?: PutOptions): Promise<BlobMetadata>;
  get(key: string): Promise<Buffer | null>;
  stat(key: string): Promise<BlobMetadata | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  /** List metadata for stored blobs, optionally filtered by key prefix. */
  list(prefix?: string): Promise<readonly BlobMetadata[]>;
}

/** Lowercase hex SHA-256 of a buffer. */
export const checksumOf = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
