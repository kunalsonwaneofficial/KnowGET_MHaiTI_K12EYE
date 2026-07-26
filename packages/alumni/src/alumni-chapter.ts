import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyChapterCodeError,
  EmptyChapterNameError,
  InvalidChapterTransitionError,
} from "./errors";
import type { ChapterStatus, ChapterType } from "./alumni-value";

/**
 * An alumni chapter — a regional, class-year, professional or interest-based community within the alumni
 * network, with a code (unique per tenant), a name, a type and an optional region label. It runs `forming →
 * active → inactive → archived`, with `active ↔ inactive` reactivation; archived is terminal, and a chapter
 * accepts new members only while forming or active. Its membership is the separate {@link ChapterMembership}
 * aggregate.
 */
export interface AlumniChapter {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: ChapterType;
  readonly region: string | null;
  readonly status: ChapterStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAlumniChapterParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: ChapterType;
  readonly region?: string | null;
}

/** Create an alumni chapter (status `forming`). Code and name required. */
export function createAlumniChapter(params: CreateAlumniChapterParams): AlumniChapter {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyChapterCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyChapterNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    type: params.type,
    region: params.region?.trim() || null,
    status: "forming",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (chapter: AlumniChapter, patch: Partial<AlumniChapter>): AlumniChapter => ({
  ...chapter,
  ...patch,
  updatedAt: nowIso(),
});

const requireNotArchived = (chapter: AlumniChapter, to: string): void => {
  if (chapter.status === "archived") {
    throw new InvalidChapterTransitionError(chapter.status, to);
  }
};

/** Rename a chapter; not allowed once archived. */
export function renameChapter(chapter: AlumniChapter, name: string): AlumniChapter {
  requireNotArchived(chapter, "renamed");
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyChapterNameError();
  }
  return touch(chapter, { name: trimmed });
}

/** Set the chapter's type; not allowed once archived. */
export function setChapterType(chapter: AlumniChapter, type: ChapterType): AlumniChapter {
  requireNotArchived(chapter, "type-set");
  return touch(chapter, { type });
}

/** Set the chapter's region label; not allowed once archived. */
export function setChapterRegion(chapter: AlumniChapter, region: string | null): AlumniChapter {
  requireNotArchived(chapter, "region-set");
  return touch(chapter, { region: region?.trim() || null });
}

/** Activate a forming or inactive chapter (`forming`/`inactive → active`). */
export function activateChapter(chapter: AlumniChapter): AlumniChapter {
  if (chapter.status !== "forming" && chapter.status !== "inactive") {
    throw new InvalidChapterTransitionError(chapter.status, "active");
  }
  return touch(chapter, { status: "active" });
}

/** Deactivate an active chapter (`active → inactive`). */
export function deactivateChapter(chapter: AlumniChapter): AlumniChapter {
  if (chapter.status !== "active") {
    throw new InvalidChapterTransitionError(chapter.status, "inactive");
  }
  return touch(chapter, { status: "inactive" });
}

/** Archive a chapter (→ `archived`, terminal). */
export function archiveChapter(chapter: AlumniChapter): AlumniChapter {
  if (chapter.status === "archived") {
    throw new InvalidChapterTransitionError(chapter.status, "archived");
  }
  return touch(chapter, { status: "archived" });
}

/** Whether the chapter accepts new members (forming or active). */
export const isChapterJoinable = (chapter: AlumniChapter): boolean =>
  chapter.status === "forming" || chapter.status === "active";
