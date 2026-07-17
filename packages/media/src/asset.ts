export type MediaKind = "image" | "video" | "audio" | "document" | "other";

/** A content-addressable descriptor of a media asset. */
export interface MediaAsset {
  readonly id: string;
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly size: number;
  /** Lowercase hex SHA-256 of the bytes. */
  readonly checksum: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

/** A requested derived variant of an asset (e.g. a thumbnail). */
export interface RenditionSpec {
  readonly name: string;
  /** Target MIME type; defaults to the source type. */
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
}

/** A planned/derived rendition: its spec plus the resulting asset descriptor. */
export interface Rendition {
  readonly spec: RenditionSpec;
  readonly asset: MediaAsset;
}

/** Map a MIME type to a coarse {@link MediaKind}. */
export function kindFromMime(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return "document";
  return "other";
}
