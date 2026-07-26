import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateChapter,
  archiveChapter,
  createAlumniChapter,
  deactivateChapter,
  isChapterJoinable,
  renameChapter,
} from "./alumni-chapter";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createAlumniChapter({
    tenantId,
    organizationId,
    code: "BAY",
    name: "Bay Area",
    type: "regional",
  });

describe("AlumniChapter", () => {
  it("creates forming, and runs forming → active ↔ inactive → archived", () => {
    let c = make();
    expect(c.status).toBe("forming");
    expect(isChapterJoinable(c)).toBe(true);
    c = activateChapter(c);
    expect(c.status).toBe("active");
    c = deactivateChapter(c);
    expect(c.status).toBe("inactive");
    expect(isChapterJoinable(c)).toBe(false);
    c = activateChapter(c);
    expect(c.status).toBe("active");
    c = archiveChapter(c);
    expect(c.status).toBe("archived");
  });

  it("rejects empty code/name and edits after archive", () => {
    expect(() =>
      createAlumniChapter({ tenantId, organizationId, code: " ", name: "X", type: "regional" }),
    ).toThrow(/non-empty code/);
    expect(() =>
      createAlumniChapter({ tenantId, organizationId, code: "C", name: " ", type: "regional" }),
    ).toThrow(/non-empty name/);
    expect(() => renameChapter(archiveChapter(make()), "New")).toThrow(/cannot move/);
  });
});
