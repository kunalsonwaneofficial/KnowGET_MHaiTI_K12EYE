import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyTitleError, InvalidTitleTransitionError } from "./errors";
import type { TitleStatus, TitleType } from "./library-value";

/**
 * A catalog title — the bibliographic record for a work the library holds (a book, journal, media item,
 * thesis, …). It carries an optional ISBN (unique within the tenant when present), the title, authors and
 * subjects (both lists), a type, and optional publication metadata. It runs `active ↔ withdrawn`. Physical
 * copies attach to an active title; the organization is the campus node the catalog belongs to.
 */
export interface Title {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly isbn: string | null;
  readonly title: string;
  readonly authors: readonly string[];
  readonly subjects: readonly string[];
  readonly type: TitleType;
  readonly language: string | null;
  readonly publisher: string | null;
  readonly publicationYear: number | null;
  readonly status: TitleStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CatalogTitleParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly type: TitleType;
  readonly isbn?: string | null;
  readonly authors?: readonly string[];
  readonly subjects?: readonly string[];
  readonly language?: string | null;
  readonly publisher?: string | null;
  readonly publicationYear?: number | null;
}

const cleanList = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);

/** Catalog a title (status `active`). A non-empty title is required. */
export function catalogTitle(params: CatalogTitleParams): Title {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    isbn: params.isbn?.trim() || null,
    title,
    authors: cleanList(params.authors),
    subjects: cleanList(params.subjects),
    type: params.type,
    language: params.language?.trim() || null,
    publisher: params.publisher?.trim() || null,
    publicationYear: params.publicationYear ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (title: Title, patch: Partial<Title>): Title => ({
  ...title,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a title. */
export function renameTitle(title: Title, newTitle: string): Title {
  const trimmed = newTitle.trim();
  if (trimmed.length === 0) {
    throw new EmptyTitleError();
  }
  return touch(title, { title: trimmed });
}

/** Replace the title's author list. */
export const setTitleAuthors = (title: Title, authors: readonly string[]): Title =>
  touch(title, { authors: cleanList(authors) });

/** Replace the title's subject list. */
export const setTitleSubjects = (title: Title, subjects: readonly string[]): Title =>
  touch(title, { subjects: cleanList(subjects) });

/** Set (or clear) the title's publication metadata. */
export const setTitleMetadata = (
  title: Title,
  metadata: {
    isbn?: string | null;
    language?: string | null;
    publisher?: string | null;
    publicationYear?: number | null;
  },
): Title =>
  touch(title, {
    isbn: metadata.isbn === undefined ? title.isbn : metadata.isbn?.trim() || null,
    language: metadata.language === undefined ? title.language : metadata.language?.trim() || null,
    publisher:
      metadata.publisher === undefined ? title.publisher : metadata.publisher?.trim() || null,
    publicationYear:
      metadata.publicationYear === undefined ? title.publicationYear : metadata.publicationYear,
  });

/** Withdraw a title from the collection (→ `withdrawn`). */
export function withdrawTitle(title: Title): Title {
  if (title.status !== "active") {
    throw new InvalidTitleTransitionError(title.status, "withdrawn");
  }
  return touch(title, { status: "withdrawn" });
}

/** Restore a withdrawn title to the collection (→ `active`). */
export function restoreTitle(title: Title): Title {
  if (title.status !== "withdrawn") {
    throw new InvalidTitleTransitionError(title.status, "active");
  }
  return touch(title, { status: "active" });
}

/** Whether the title is active (can take copies). */
export const isTitleActive = (title: Title): boolean => title.status === "active";
