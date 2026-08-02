import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { validateSchemaFields } from "./compatibility";
import {
  DeprecationNoticeTooShortError,
  EmptyMeshKeyError,
  EventTypeNotDeprecatedError,
  EventTypeRetiredError,
  EventTypeSchemaFrozenError,
  InvalidEventTypeProgressionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  RetirementBeforeDeprecationError,
} from "./errors";
import {
  inspectEventTypeDeprecation,
  inspectEventTypeTransition,
  inspectPublication,
} from "./lifecycle";
import {
  type CompatibilityMode,
  DEFAULT_COMPATIBILITY_MODE,
  type EventTypeStatus,
  FIRST_EVENT_TYPE_VERSION,
  INITIAL_EVENT_TYPE_STATUS,
  MIN_DEPRECATION_NOTICE_DAYS,
  type SchemaField,
  isEventTypePublishable,
  isEventTypeSchemaEditable,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import type { PublicationVerdict } from "./mesh-view";

/**
 * One version of one event type, as every consumer of it was told it would look.
 *
 * This is the aggregate the registry exists for, and it carries the same promise the gateway's contract carries,
 * made about a different thing. **A published schema cannot be edited.** Not to correct a field name, not to
 * tighten a type, not to add a field that every producer already sends. The schema is the document a consumer
 * wrote their reader against, and editing it does not update their reader — it makes their reader wrong, at the
 * moment the next event arrives, with nothing failing anywhere either team is looking. There is no flag for a
 * small change, because *small* is a judgement made by the person making it and experienced by somebody else.
 *
 * What replaces editing is versioning, and versions here are major only. A change of shape is a new number, the
 * old number keeps flowing until it is deprecated on notice, and two versions of one event type on the mesh at
 * once is the mechanism rather than a defect to be minimised. An institution that runs one version at a time is
 * one that breaks a consumer every time a payload gains a field.
 *
 * **The notice floor is ninety days and is not a parameter.** {@link deprecateEventType} delegates to
 * {@link inspectEventTypeDeprecation}, which refuses anything shorter. The pressure to shorten it is always
 * real and always comes from inside the institution; the cost always lands on the consumers who are not in the
 * room, and who find out when their events stop arriving.
 *
 * **Deprecation does not stop delivery.** A deprecated version still publishes, which is the entire point of the
 * notice period: consumers migrate while events keep flowing. Retirement is what stops it, and it is reachable
 * from `deprecated` — or from `draft`, which is how a version that will never ship is withdrawn. It is not
 * reachable from `published`, and that refusal is the whole lifecycle in one edge.
 *
 * Two things this aggregate deliberately does not do. It does not check that its version number follows the one
 * before it, and it does not refuse a key-and-version pair that already exists: both are questions about what
 * else the registry holds, this package holds no directory of its own definitions, and a uniqueness check
 * invented inside an aggregate would be a second opinion about what exists. It also does not compare its schema
 * against its predecessor's — `assessCompatibility` does that, from a service that can fetch the
 * predecessor, because a version cannot judge its own compatibility without being handed the thing it broke.
 */

// --- The aggregate ---------------------------------------------------------------

export interface EventTypeDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The type being registered, e.g. `admissions.application.submitted`. Public and immutable. */
  readonly eventTypeKey: string;
  /** The major version a consumer pins to. Immutable: pinning to a moving target is not pinning. */
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  /** The promise made to readers across versions. Frozen on publication with everything else. */
  readonly compatibilityMode: CompatibilityMode;
  readonly status: EventTypeStatus;
  /** The payload shape, in declaration order, validated and frozen. Editable only while `draft`. */
  readonly schemaFields: readonly SchemaField[];
  readonly publishedAt: ISODateString | null;
  readonly publishedBy: Uuid | null;
  /** When notice was given. `null` until it is, and the anchor the notice period is measured from. */
  readonly deprecatedAt: ISODateString | null;
  /** When this version stops being carried. Announced with the deprecation, never after it. */
  readonly retireAt: ISODateString | null;
  /** The version consumers should move to. Named at deprecation, so the notice is actionable. */
  readonly supersededByVersion: number | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineEventTypeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly eventTypeKey: string;
  /** Defaults to the first version. Whether it is the *next* version is the directory's question, not this one. */
  readonly version?: number;
  readonly title: string;
  readonly summary: string;
  /** Defaults to `backward`, which is what an upgrading reader and a replayer both need. */
  readonly compatibilityMode?: CompatibilityMode;
  readonly schemaFields: readonly SchemaField[];
}

export interface ReviseEventTypeParams {
  readonly title: string;
  readonly summary: string;
  readonly compatibilityMode: CompatibilityMode;
  readonly schemaFields: readonly SchemaField[];
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyMeshKeyError(kind);
  if (!isValidKey(key)) throw new InvalidMeshKeyError(kind, key);
  return key;
}

/**
 * Refuse a version number that could not be one.
 *
 * {@link InvalidMeshCountError} rather than a version-specific error, because the versions the registry has
 * strong opinions about are the ones that exist: a gap, a repeat, a successor pointing backwards. A negative or
 * fractional version is none of those. It is a number that was never a version, and the honest message says so.
 */
function requireVersion(kind: string, value: number): number {
  if (!Number.isInteger(value) || value < FIRST_EVENT_TYPE_VERSION) {
    throw new InvalidMeshCountError(
      kind,
      value,
      `must be a whole version number of ${FIRST_EVENT_TYPE_VERSION} or more`,
    );
  }
  return value;
}

/** Refuse any edit to a version that has been published. This is the registry's central promise. */
function requireEditable(definition: EventTypeDefinition): void {
  if (!isEventTypeSchemaEditable(definition.status)) {
    throw new EventTypeSchemaFrozenError(definition.id, definition.status);
  }
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * Three outcomes rather than one, because the three have different remedies. A retired version is finished and
 * says so, which is also the complete answer to a second request to retire it — the engine distinguishes a
 * resubmission from a finished record, and for something the mesh no longer carries that distinction buys
 * nobody anything. A published version asked to retire is the case worth naming precisely: the caller is not
 * confused about the lifecycle, they are skipping the notice period, and {@link EventTypeNotDeprecatedError}
 * tells them the step they left out rather than that the move is impossible. Everything else is the general
 * refusal, carrying both statuses so the caller can see the move they actually asked for.
 */
function requireEventTypeTransition(definition: EventTypeDefinition, to: EventTypeStatus): void {
  const verdict = inspectEventTypeTransition(definition.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || definition.status === "retired") {
    throw new EventTypeRetiredError(definition.id);
  }
  if (to === "retired") {
    throw new EventTypeNotDeprecatedError(definition.id, definition.status);
  }
  throw new InvalidEventTypeProgressionError(definition.id, definition.status, to);
}

// --- Definition ------------------------------------------------------------------

/**
 * Register a version of an event type. Nothing is promised to anybody until it is published.
 *
 * The draft status is where the design pays for itself. Because publication freezes the shape permanently, there
 * has to be a state in which the shape is still being argued about, and it has to be the state a definition is
 * born in. There is no parameter that publishes on creation.
 *
 * The schema goes through {@link validateSchemaFields}, which returns a frozen, name-trimmed copy — so the
 * array on the aggregate is not the array the caller passed and cannot be mutated behind it afterwards.
 *
 * @throws {EmptyMeshKeyError} when the event type key is blank.
 * @throws {InvalidMeshCountError} when the version could not be a version.
 * @throws {InvalidMeshKeyError} when the key does not fit the platform's grammar, and every schema refusal
 *   {@link validateSchemaFields} names.
 */
export function defineEventType(params: DefineEventTypeParams): EventTypeDefinition {
  const eventTypeKey = requireKey("event type", params.eventTypeKey);
  const version = requireVersion("event type version", params.version ?? FIRST_EVENT_TYPE_VERSION);
  const schemaFields = validateSchemaFields(eventTypeKey, params.schemaFields);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    eventTypeKey,
    version,
    title: params.title.trim(),
    summary: params.summary.trim(),
    compatibilityMode: params.compatibilityMode ?? DEFAULT_COMPATIBILITY_MODE,
    status: INITIAL_EVENT_TYPE_STATUS,
    schemaFields,
    publishedAt: null,
    publishedBy: null,
    deprecatedAt: null,
    retireAt: null,
    supersededByVersion: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Change everything about a draft that is still arguable: its prose, its promise and its shape.
 *
 * One operation rather than three, because the three are one decision. A compatibility mode revised apart from
 * the schema it governs is a window in which the record claims a promise the fields do not keep, and a title
 * describing a shape the schema no longer has is how a reviewer approves the wrong thing. The key and the
 * version are not revisable at all: they are what a producer publishes under and a consumer pins to, and a draft
 * that renumbered itself would strand every subscription already pointing at it.
 *
 * @throws {EventTypeSchemaFrozenError} when the version has been published, which is the point of the freeze.
 */
export function reviseEventType(
  definition: EventTypeDefinition,
  params: ReviseEventTypeParams,
): EventTypeDefinition {
  requireEditable(definition);
  return {
    ...definition,
    title: params.title.trim(),
    summary: params.summary.trim(),
    compatibilityMode: params.compatibilityMode,
    schemaFields: validateSchemaFields(definition.eventTypeKey, params.schemaFields),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Publish the version, and freeze its shape.
 *
 * `publishedBy` is required because this is the moment the institution promises a shape it cannot take back, and
 * a promise with no name on it is one no review will ever find the reasoning for.
 */
export function publishEventType(
  definition: EventTypeDefinition,
  publishedBy: Uuid,
): EventTypeDefinition {
  requireEventTypeTransition(definition, "published");
  const now = nowIso();
  return { ...definition, status: "published", publishedAt: now, publishedBy, updatedAt: now };
}

/**
 * Give notice that the version will stop being carried, and say when and what replaces it.
 *
 * `announcedAt` is a parameter rather than the current instant, which looks like an invitation to backdate and
 * is not one: the notice is measured *from* it, so an earlier announcement makes the period longer and therefore
 * harder to satisfy, never shorter. What the parameter buys is a deprecation recorded faithfully when the
 * announcement went out through a channel the platform does not own, which is how most of them go out.
 *
 * `supersededByVersion` is required and must be later than this one. A notice that does not say what to move to
 * is a notice its recipient cannot act on, and one pointing backwards is a transposed pair of arguments that
 * would otherwise be published to every consumer as advice.
 *
 * The engine's `not_published` refusal is unreachable from here, because `published` is the only status with an
 * edge to `deprecated` and the transition is checked first. It is left in the engine because the engine is also
 * asked in advance, by a caller holding a status rather than a record.
 *
 * @throws {RetirementBeforeDeprecationError} when the dates describe no notice period at all.
 * @throws {DeprecationNoticeTooShortError} when they describe one shorter than the platform's floor.
 */
export function deprecateEventType(
  definition: EventTypeDefinition,
  announcedAt: ISODateString,
  retireAt: ISODateString,
  supersededByVersion: number,
): EventTypeDefinition {
  requireEventTypeTransition(definition, "deprecated");
  const successor = requireVersion("superseding version", supersededByVersion);
  if (successor <= definition.version) {
    throw new InvalidMeshCountError(
      "superseding version",
      successor,
      `must be later than version ${definition.version}, which is the one being deprecated`,
    );
  }

  const verdict = inspectEventTypeDeprecation({
    eventTypeKey: definition.eventTypeKey,
    version: definition.version,
    status: definition.status,
    announcedAt,
    retireAt,
  });
  if (!verdict.allowed) {
    if (verdict.refusal === "retirement_before_announcement") {
      throw new RetirementBeforeDeprecationError(definition.id, announcedAt, retireAt);
    }
    throw new DeprecationNoticeTooShortError(
      definition.id,
      verdict.noticeDays,
      MIN_DEPRECATION_NOTICE_DAYS,
    );
  }

  return {
    ...definition,
    status: "deprecated",
    deprecatedAt: announcedAt,
    retireAt,
    supersededByVersion: successor,
    updatedAt: nowIso(),
  };
}

/**
 * Stop carrying the version.
 *
 * `retireAt` keeps whatever the deprecation announced rather than being restamped, because the announced date is
 * what consumers scheduled their work around and the job that performs the retirement rarely runs at the instant
 * the date arrives. Only a version retired without ever having been deprecated — a draft being withdrawn — takes
 * the current instant, there being no announced date to preserve.
 */
export function retireEventType(definition: EventTypeDefinition): EventTypeDefinition {
  requireEventTypeTransition(definition, "retired");
  const now = nowIso();
  return {
    ...definition,
    status: "retired",
    retireAt: definition.retireAt ?? now,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Carried by the mesh: published, or deprecated and still inside its notice period. */
export const isEventTypeCarried = (definition: EventTypeDefinition): boolean =>
  isEventTypePublishable(definition.status);

/** Frozen: anything but a draft. The shape is now somebody else's dependency. */
export const isEventTypeSchemaFrozen = (definition: EventTypeDefinition): boolean =>
  !isEventTypeSchemaEditable(definition.status);

/**
 * Whether the mesh accepts a publication of this version at an instant the caller names, and on what terms.
 *
 * A reader rather than a rule: nothing here changes a status, and asking about an instant last term is a
 * legitimate question with a legitimate answer. That is what makes *were these producers on notice in March*
 * answerable from the row rather than from a reconstruction of what the retirement job was doing at the time.
 */
export const eventTypePublication = (
  definition: EventTypeDefinition,
  asOf: ISODateString,
): PublicationVerdict =>
  inspectPublication({
    eventTypeKey: definition.eventTypeKey,
    version: definition.version,
    status: definition.status,
    deprecatedAt: definition.deprecatedAt,
    retireAt: definition.retireAt,
    asOf,
  });
