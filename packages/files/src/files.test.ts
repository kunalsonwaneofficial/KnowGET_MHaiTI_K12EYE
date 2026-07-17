import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "@knowget/exceptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checksumOf } from "./blob-store";
import { InMemoryBlobStore } from "./in-memory-blob-store";
import { NodeFsBlobStore } from "./node-fs-blob-store";

describe("InMemoryBlobStore", () => {
  it("stores, reads and describes a blob", async () => {
    const store = new InMemoryBlobStore();
    const data = Buffer.from("hello world");
    const meta = await store.put("docs/a.txt", data, { contentType: "text/plain" });
    expect(meta.size).toBe(11);
    expect(meta.contentType).toBe("text/plain");
    expect(meta.checksum).toBe(checksumOf(data));
    expect((await store.get("docs/a.txt"))?.toString()).toBe("hello world");
    expect(await store.exists("docs/a.txt")).toBe(true);
    expect(await store.stat("docs/a.txt")).toEqual(meta);
  });

  it("returns null for missing blobs", async () => {
    const store = new InMemoryBlobStore();
    expect(await store.get("nope")).toBeNull();
    expect(await store.stat("nope")).toBeNull();
    expect(await store.exists("nope")).toBe(false);
  });

  it("lists by prefix and deletes", async () => {
    const store = new InMemoryBlobStore();
    await store.put("a/1", Buffer.from("1"));
    await store.put("a/2", Buffer.from("2"));
    await store.put("b/1", Buffer.from("3"));
    expect(await store.list("a/")).toHaveLength(2);
    expect(await store.delete("a/1")).toBe(true);
    expect(await store.delete("a/1")).toBe(false);
    expect(await store.list("a/")).toHaveLength(1);
  });

  it("isolates stored content from later mutation of the source buffer", async () => {
    const store = new InMemoryBlobStore();
    const data = Buffer.from("original");
    await store.put("k", data);
    data.write("XXXXXXXX");
    expect((await store.get("k"))?.toString()).toBe("original");
  });
});

describe("NodeFsBlobStore", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "knowget-files-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips content and metadata through the filesystem", async () => {
    const store = new NodeFsBlobStore(dir);
    const data = Buffer.from("persisted");
    const meta = await store.put("nested/file.bin", data, { contentType: "application/pdf" });
    expect((await store.get("nested/file.bin"))?.equals(data)).toBe(true);
    const stat = await store.stat("nested/file.bin");
    expect(stat?.checksum).toBe(meta.checksum);
    expect(stat?.contentType).toBe("application/pdf");
  });

  it("lists by prefix and deletes both content and sidecar", async () => {
    const store = new NodeFsBlobStore(dir);
    await store.put("list/x", Buffer.from("x"));
    await store.put("list/y", Buffer.from("y"));
    const listed = await store.list("list/");
    expect(listed.map((m) => m.key).sort()).toEqual(["list/x", "list/y"]);
    expect(await store.delete("list/x")).toBe(true);
    expect(await store.get("list/x")).toBeNull();
    expect(await store.stat("list/x")).toBeNull();
  });

  it("rejects keys that escape the storage root", async () => {
    const store = new NodeFsBlobStore(dir);
    await expect(store.put("../escape", Buffer.from("x"))).rejects.toBeInstanceOf(ValidationError);
    await expect(store.get("/etc/passwd")).rejects.toBeInstanceOf(ValidationError);
  });
});
