import { createHash } from "node:crypto";
import { newUuid } from "@knowget/shared";
import { kindFromMime, type MediaAsset, type Rendition, type RenditionSpec } from "./asset";

export interface DescribeOptions {
  /** Known pixel dimensions (a real decoder would derive these). */
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

/**
 * Derives asset descriptors and plans renditions. Actual pixel/transcode work
 * (resizing, format conversion) is deferred to a real processor (e.g. sharp /
 * ffmpeg) behind this same contract; the Phase-1 default derives content-address
 * metadata and computes rendition descriptors without touching pixels.
 */
export interface MediaProcessor {
  describe(data: Buffer, mimeType: string, options?: DescribeOptions): MediaAsset;
  createRendition(source: MediaAsset, spec: RenditionSpec): Rendition;
}

export class PassthroughMediaProcessor implements MediaProcessor {
  describe(data: Buffer, mimeType: string, options: DescribeOptions = {}): MediaAsset {
    return {
      id: newUuid(),
      kind: kindFromMime(mimeType),
      mimeType,
      size: data.byteLength,
      checksum: createHash("sha256").update(data).digest("hex"),
      ...(options.width !== undefined ? { width: options.width } : {}),
      ...(options.height !== undefined ? { height: options.height } : {}),
      ...(options.durationMs !== undefined ? { durationMs: options.durationMs } : {}),
    };
  }

  createRendition(source: MediaAsset, spec: RenditionSpec): Rendition {
    // Descriptor-only: the derived asset inherits the source bytes/checksum but
    // records the requested target format and dimensions. A real processor
    // would produce new bytes (and a new checksum/size).
    const asset: MediaAsset = {
      ...source,
      id: newUuid(),
      mimeType: spec.format ?? source.mimeType,
      ...(spec.width !== undefined ? { width: spec.width } : {}),
      ...(spec.height !== undefined ? { height: spec.height } : {}),
    };
    return { spec, asset };
  }
}
