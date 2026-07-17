import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { ValidationError } from "@knowget/exceptions";
import { nowIso } from "@knowget/shared";
import {
  type BlobMetadata,
  type BlobStore,
  checksumOf,
  DEFAULT_CONTENT_TYPE,
  type PutOptions,
} from "./blob-store";

const META_SUFFIX = ".meta.json";

/**
 * Node-filesystem {@link BlobStore}. Blob content is written under `root/<key>`
 * with a JSON metadata sidecar (`<key>.meta.json`). Keys are confined to the
 * root — any attempt to escape it (absolute paths, `..`) raises a
 * {@link ValidationError} — so untrusted keys cannot traverse the filesystem.
 */
export class NodeFsBlobStore implements BlobStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new ValidationError("Blob key escapes the storage root", { details: { key } });
    }
    if (full.endsWith(META_SUFFIX)) {
      throw new ValidationError("Blob key must not end with the metadata suffix", {
        details: { key },
      });
    }
    return full;
  }

  async put(key: string, data: Buffer, options: PutOptions = {}): Promise<BlobMetadata> {
    const path = this.pathFor(key);
    const meta: BlobMetadata = {
      key,
      size: data.byteLength,
      contentType: options.contentType ?? DEFAULT_CONTENT_TYPE,
      checksum: checksumOf(data),
      createdAt: nowIso(),
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    await writeFile(`${path}${META_SUFFIX}`, JSON.stringify(meta), "utf8");
    return meta;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async stat(key: string): Promise<BlobMetadata | null> {
    try {
      const raw = await readFile(`${this.pathFor(key)}${META_SUFFIX}`, "utf8");
      return JSON.parse(raw) as BlobMetadata;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async delete(key: string): Promise<boolean> {
    const path = this.pathFor(key);
    const existed = (await this.get(key)) !== null;
    await rm(path, { force: true });
    await rm(`${path}${META_SUFFIX}`, { force: true });
    return existed;
  }

  async list(prefix?: string): Promise<readonly BlobMetadata[]> {
    const metas = await this.collectMeta(this.root);
    return prefix ? metas.filter((m) => m.key.startsWith(prefix)) : metas;
  }

  private async collectMeta(dir: string): Promise<BlobMetadata[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const result: BlobMetadata[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await this.collectMeta(full)));
      } else if (entry.name.endsWith(META_SUFFIX)) {
        result.push(JSON.parse(await readFile(full, "utf8")) as BlobMetadata);
      }
    }
    return result;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
