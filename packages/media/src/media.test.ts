import { describe, expect, it } from "vitest";
import { kindFromMime } from "./asset";
import { PassthroughMediaProcessor } from "./processor";

describe("kindFromMime", () => {
  it("classifies MIME types into coarse kinds", () => {
    expect(kindFromMime("image/png")).toBe("image");
    expect(kindFromMime("video/mp4")).toBe("video");
    expect(kindFromMime("audio/mpeg")).toBe("audio");
    expect(kindFromMime("application/pdf")).toBe("document");
    expect(kindFromMime("text/plain")).toBe("document");
    expect(kindFromMime("application/zip")).toBe("other");
  });
});

describe("PassthroughMediaProcessor", () => {
  const processor = new PassthroughMediaProcessor();

  it("describes an asset with content-addressable metadata", () => {
    const data = Buffer.from("fake-image-bytes");
    const asset = processor.describe(data, "image/png", { width: 800, height: 600 });
    expect(asset.kind).toBe("image");
    expect(asset.size).toBe(data.byteLength);
    expect(asset.checksum).toHaveLength(64);
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);
  });

  it("plans a rendition descriptor with target format and dimensions", () => {
    const source = processor.describe(Buffer.from("x"), "image/png", { width: 800, height: 600 });
    const rendition = processor.createRendition(source, {
      name: "thumbnail",
      format: "image/webp",
      width: 128,
      height: 128,
    });
    expect(rendition.spec.name).toBe("thumbnail");
    expect(rendition.asset.mimeType).toBe("image/webp");
    expect(rendition.asset.width).toBe(128);
    expect(rendition.asset.id).not.toBe(source.id);
  });
});
