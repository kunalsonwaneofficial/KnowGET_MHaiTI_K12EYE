import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  catalogTitle,
  isTitleActive,
  renameTitle,
  restoreTitle,
  setTitleAuthors,
  setTitleMetadata,
  setTitleSubjects,
  withdrawTitle,
} from "./title";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  catalogTitle({
    tenantId,
    organizationId,
    title: "  Clean Code  ",
    type: "book",
    isbn: " 978-0132350884 ",
    authors: ["Robert C. Martin", "  "],
    subjects: ["Software", ""],
  });

describe("catalogTitle", () => {
  it("catalogs an active title with trimmed fields and cleaned lists", () => {
    const t = make();
    expect(t.title).toBe("Clean Code");
    expect(t.isbn).toBe("978-0132350884");
    expect(t.authors).toEqual(["Robert C. Martin"]); // blanks dropped
    expect(t.subjects).toEqual(["Software"]);
    expect(t.status).toBe("active");
    expect(isTitleActive(t)).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(() => catalogTitle({ tenantId, organizationId, title: "  ", type: "book" })).toThrow();
  });
});

describe("title edits", () => {
  it("renames and replaces lists and metadata", () => {
    expect(renameTitle(make(), "Refactoring").title).toBe("Refactoring");
    expect(setTitleAuthors(make(), ["A", "B"]).authors).toEqual(["A", "B"]);
    expect(setTitleSubjects(make(), ["X"]).subjects).toEqual(["X"]);
    const meta = setTitleMetadata(make(), { language: "en", publicationYear: 2008 });
    expect(meta.language).toBe("en");
    expect(meta.publicationYear).toBe(2008);
    expect(meta.isbn).toBe("978-0132350884"); // unchanged
  });

  it("rejects renaming to blank", () => {
    expect(() => renameTitle(make(), "   ")).toThrow();
  });
});

describe("title lifecycle", () => {
  it("withdraws and restores", () => {
    const withdrawn = withdrawTitle(make());
    expect(withdrawn.status).toBe("withdrawn");
    expect(isTitleActive(withdrawn)).toBe(false);
    expect(restoreTitle(withdrawn).status).toBe("active");
  });

  it("rejects invalid transitions", () => {
    expect(() => restoreTitle(make())).toThrow();
    expect(() => withdrawTitle(withdrawTitle(make()))).toThrow();
  });
});
