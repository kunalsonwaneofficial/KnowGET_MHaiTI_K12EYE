import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySectionFieldError, InvalidCapacityError, SectionClosedError } from "./errors";

/**
 * The lifecycle of a section: `planned` while being set up, `active` once running, and
 * `closed` at the end of its academic year. A closed section is terminal.
 */
export type SectionStatus = "planned" | "active" | "closed";

/**
 * A section — a teachable division of a class (e.g. "5-A"), with a seating capacity and a
 * planned → active → closed lifecycle. A section belongs to a Class and derives its
 * organization from it. Unique by name within a class.
 */
export interface Section {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly classId: Uuid;
  readonly name: string;
  readonly capacity: number;
  readonly status: SectionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSectionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly classId: Uuid;
  readonly name: string;
  readonly capacity: number;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptySectionFieldError(field);
  }
  return trimmed;
};

const requireCapacity = (capacity: number): number => {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new InvalidCapacityError(capacity);
  }
  return capacity;
};

/** Create a new, planned section within a class. */
export function createSection(params: CreateSectionParams): Section {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    classId: params.classId,
    name: requireText(params.name, "name"),
    capacity: requireCapacity(params.capacity),
    status: "planned",
    createdAt: now,
    updatedAt: now,
  };
}

const assertNotClosed = (section: Section): void => {
  if (section.status === "closed") {
    throw new SectionClosedError(section.id);
  }
};

const touch = (section: Section, patch: Partial<Section>): Section => ({
  ...section,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename the section. Not permitted once closed. */
export function renameSection(section: Section, name: string): Section {
  assertNotClosed(section);
  return touch(section, { name: requireText(name, "name") });
}

/** Set the section's seating capacity. Not permitted once closed. */
export function setSectionCapacity(section: Section, capacity: number): Section {
  assertNotClosed(section);
  return touch(section, { capacity: requireCapacity(capacity) });
}

/** Activate the section (planned → active). Not permitted once closed. */
export function activateSection(section: Section): Section {
  assertNotClosed(section);
  return touch(section, { status: "active" });
}

/** Close the section — the terminal transition. */
export function closeSection(section: Section): Section {
  assertNotClosed(section);
  return touch(section, { status: "closed" });
}
