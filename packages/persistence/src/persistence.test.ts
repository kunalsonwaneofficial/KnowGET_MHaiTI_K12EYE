import { ValidationError } from "@knowget/exceptions";
import type { ISODateString, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { stampCreate, stampUpdate } from "./audit";
import { isDeleted } from "./entity";
import { DEFAULT_PAGE, pageOffset, toPageResult } from "./query";
import { and, not, or, spec } from "./specification";
import { validateEntity } from "./validation";
import { z } from "zod";

describe("specification", () => {
  const gt5 = spec<number>((n) => n > 5);
  const even = spec<number>((n) => n % 2 === 0);

  it("composes and/or/not", () => {
    expect(and(gt5, even).isSatisfiedBy(6)).toBe(true);
    expect(and(gt5, even).isSatisfiedBy(7)).toBe(false);
    expect(or(gt5, even).isSatisfiedBy(2)).toBe(true);
    expect(not(gt5).isSatisfiedBy(3)).toBe(true);
  });
});

describe("query", () => {
  it("builds page results and offsets", () => {
    const result = toPageResult([1, 2], 42, { page: 3, pageSize: 20 });
    expect(result).toMatchObject({ page: 3, pageSize: 20, totalItems: 42, totalPages: 3 });
    expect(pageOffset({ page: 3, pageSize: 20 })).toBe(40);
    expect(pageOffset(DEFAULT_PAGE)).toBe(0);
  });
});

describe("audit", () => {
  const actor = { now: "2026-01-01T00:00:00.000Z" as ISODateString, actorId: "u1" as Uuid };

  it("stamps create and preserves creation fields on update", () => {
    const created = stampCreate(actor);
    expect(created.createdBy).toBe("u1");
    const updated = stampUpdate(created, {
      now: "2026-02-01T00:00:00.000Z" as ISODateString,
      actorId: "u2" as Uuid,
    });
    expect(updated.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(updated.updatedBy).toBe("u2");
  });
});

describe("validation", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns parsed data on success", () => {
    expect(validateEntity(schema, { name: "ok" })).toEqual({ name: "ok" });
  });

  it("throws ValidationError on failure", () => {
    expect(() => validateEntity(schema, { name: "" })).toThrow(ValidationError);
  });
});

describe("entity", () => {
  it("detects soft-deleted entities", () => {
    expect(isDeleted({ deletedAt: null })).toBe(false);
    expect(isDeleted({ deletedAt: "2026-01-01T00:00:00.000Z" as ISODateString })).toBe(true);
  });
});
