import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  ContractFrozenError,
  ContractSunsetError,
  DeprecationNoticeTooShortError,
  EmptyGatewayKeyError,
  InvalidContractProgressionError,
  InvalidGatewayKeyError,
  SunsetBeforeAnnouncementError,
} from "./errors";
import {
  type ContractStatus,
  type ContractStyle,
  DEFAULT_CONTRACT_STYLE,
  INITIAL_CONTRACT_STATUS,
  MIN_DEPRECATION_NOTICE_DAYS,
  isContractServable,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { ServingVerdict } from "./gateway-view";
import { inspectContractTransition, inspectDeprecation, inspectServing } from "./lifecycle";

/**
 * A capability contract: one version of one capability, as the outside world was told it would behave.
 *
 * This is the aggregate the whole contract of P3-D01 rests on, and its single most important property is the one
 * that looks like an inconvenience. **A published contract cannot be edited.** Not to fix a field name, not to
 * tighten a validation, not to add a required parameter that everyone will obviously want. The document an
 * integrator wrote code against is the only thing standing between the platform refactoring itself and their
 * code breaking at a moment nobody chose, and an edit does not update their code — it makes their code wrong,
 * silently. There is no flag for a small change, because *small* is a judgement made by the person making the
 * change and experienced by somebody else.
 *
 * What replaces editing is versioning. A change to a published capability is a new contract at a new version;
 * the old one keeps answering until it is deprecated on notice and then sunset. Two versions of the same
 * capability answering at once is not a defect to be minimised — it is the mechanism, and an institution that
 * runs one version at a time is one that breaks its integrators every release.
 *
 * **The notice floor is ninety days and is not a parameter.** {@link deprecateApiContract} delegates to
 * {@link inspectDeprecation}, which refuses anything shorter. The pressure to shorten it is always real and
 * always comes from inside the institution; the cost always lands on integrators who are not in the room.
 *
 * **The specification is referenced, not held.** `specificationRef` is a handle to an OpenAPI 3.1 or AsyncAPI
 * document wherever the platform keeps such documents. Storing the document inside the aggregate would make the
 * row large, make the diff unreadable and — the actual problem — make it tempting to edit the specification
 * without moving the status, which is precisely the thing the frozen rule exists to prevent.
 *
 * Note what this aggregate does *not* have: any field naming an internal module, service, table or handler.
 * Which capability is contracted is public; what implements it is not, and it is not recorded here at all.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ApiContract {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The capability being contracted, e.g. `admissions.applications`. Public and immutable. */
  readonly capabilityKey: string;
  /** The version an integrator pins to, e.g. `v2`. Immutable: pinning to a moving target is not pinning. */
  readonly contractVersion: string;
  readonly title: string;
  readonly summary: string;
  readonly style: ContractStyle;
  readonly status: ContractStatus;
  /** A handle to the OpenAPI 3.1 or AsyncAPI document, never the document. Frozen on publication. */
  readonly specificationRef: string;
  readonly publishedAt: ISODateString | null;
  readonly publishedBy: Uuid | null;
  /** When notice was given. `null` until it is, and the anchor the notice period is measured from. */
  readonly deprecatedAt: ISODateString | null;
  /** When this version stops answering. Announced with the deprecation, never after it. */
  readonly sunsetAt: ISODateString | null;
  /** The version integrators should move to. Named at deprecation so the notice is actionable. */
  readonly supersededByVersion: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineApiContractParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly title: string;
  readonly summary: string;
  /** Defaults to REST when unstated, because that is what an unqualified *the API* means to an integrator. */
  readonly style?: ContractStyle;
  readonly specificationRef: string;
}

export interface ReviseApiContractParams {
  readonly title: string;
  readonly summary: string;
  readonly specificationRef: string;
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/**
 * Refuse a blank specification reference.
 *
 * A version with no specification behind it is a promise with no text, and the platform would go on serving it
 * while every integrator asking what it does got an empty handle. The grammar is not constrained further than
 * non-blank because where the platform keeps specifications is a deployment concern and a pattern enforced here
 * would be a guess about it.
 */
function requireSpecificationRef(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("specification reference");
  return trimmed;
}

/** Refuse any edit to a contract that has been published. This is the contract's central promise. */
function requireDraft(contract: ApiContract): void {
  if (contract.status !== "draft") throw new ContractFrozenError(contract.id, contract.status);
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A sunset contract gets its own error carrying the capability and the version rather than the row id, because
 * the caller who hits this is usually an integrator's request rather than an operator's form, and the two facts
 * they need are which capability stopped answering and at which version.
 *
 * That error covers the engine's `same_status` refusal too whenever the contract is already sunset. The engine
 * distinguishes a resubmitted request from a finished record because for a consumer those have different
 * remedies; for a version that has stopped answering they do not. *It is sunset* is the complete answer to every
 * question about it, including the request to sunset it again.
 */
function requireContractTransition(contract: ApiContract, to: ContractStatus): void {
  const verdict = inspectContractTransition(contract.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || contract.status === "sunset") {
    throw new ContractSunsetError(contract.capabilityKey, contract.contractVersion);
  }
  throw new InvalidContractProgressionError(contract.id, contract.status, to);
}

// --- Definition ------------------------------------------------------------------

/**
 * Draft a version of a capability. Nothing is promised to anybody until it is published.
 *
 * The draft status is where the whole design pays for itself. Because publication is irreversible in the sense
 * that matters — the shape can never change afterwards — there has to be a state in which the shape is still
 * being argued about, and it has to be the state a contract is born in. There is no parameter that publishes on
 * creation.
 *
 * Nothing here refuses a duplicate capability-and-version pair. This package holds no directory of its own
 * contracts, and a uniqueness check invented inside an aggregate would be a second opinion about what exists.
 */
export function defineApiContract(params: DefineApiContractParams): ApiContract {
  const capabilityKey = requireKey("capability", params.capabilityKey);
  const contractVersion = requireKey("contract version", params.contractVersion);
  const specificationRef = requireSpecificationRef(params.specificationRef);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    capabilityKey,
    contractVersion,
    title: params.title.trim(),
    summary: params.summary.trim(),
    style: params.style ?? DEFAULT_CONTRACT_STYLE,
    status: INITIAL_CONTRACT_STATUS,
    specificationRef,
    publishedAt: null,
    publishedBy: null,
    deprecatedAt: null,
    sunsetAt: null,
    supersededByVersion: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Change the draft's text and the specification it points at.
 *
 * One operation for all three fields rather than three, because they describe the same thing and a title that
 * says one thing while the specification behind it says another is the state this prevents. The capability, the
 * version and the style are not revisable at all: they are what a route and an integrator address the contract
 * by, and a draft that changed its own version would strand the routes already pointing at it.
 */
export function reviseApiContract(
  contract: ApiContract,
  params: ReviseApiContractParams,
): ApiContract {
  requireDraft(contract);
  return {
    ...contract,
    title: params.title.trim(),
    summary: params.summary.trim(),
    specificationRef: requireSpecificationRef(params.specificationRef),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Publish the version, and freeze it.
 *
 * `publishedBy` is required because this is the moment the institution makes a promise it cannot take back, and
 * a promise with no name on it is one no review will ever find the reasoning for.
 */
export function publishApiContract(contract: ApiContract, publishedBy: Uuid): ApiContract {
  requireContractTransition(contract, "published");
  const now = nowIso();
  return { ...contract, status: "published", publishedAt: now, publishedBy, updatedAt: now };
}

/**
 * Give notice that the version will stop answering, and say when and what replaces it.
 *
 * `announcedAt` is a parameter rather than the current instant, which looks like an invitation to backdate and
 * is not one: {@link inspectDeprecation} measures the notice from it, so an earlier announcement date makes the
 * notice period *longer* and therefore harder to satisfy, never shorter. What the parameter actually buys is a
 * deprecation that can be recorded faithfully when the announcement went out through a channel the platform
 * does not own — a status page, a mailing list — which is how most of them go out.
 *
 * `supersededByVersion` is required. A deprecation notice that does not say what to move to is a notice its
 * recipient cannot act on, and the reliable outcome is that they act on it on the last day.
 */
export function deprecateApiContract(
  contract: ApiContract,
  announcedAt: ISODateString,
  sunsetAt: ISODateString,
  supersededByVersion: string,
): ApiContract {
  requireContractTransition(contract, "deprecated");
  const successor = requireKey("contract version", supersededByVersion);

  const verdict = inspectDeprecation({ status: contract.status, announcedAt, sunsetAt });
  if (!verdict.allowed) {
    if (verdict.refusal === "sunset_before_announcement") {
      throw new SunsetBeforeAnnouncementError(contract.id, announcedAt, sunsetAt);
    }
    throw new DeprecationNoticeTooShortError(
      contract.id,
      verdict.noticeDays,
      MIN_DEPRECATION_NOTICE_DAYS,
    );
  }

  return {
    ...contract,
    status: "deprecated",
    deprecatedAt: announcedAt,
    sunsetAt,
    supersededByVersion: successor,
    updatedAt: nowIso(),
  };
}

/**
 * Stop answering.
 *
 * Reachable from `deprecated`, which is the ordinary path, and from `draft`, which is how a version that will
 * never ship is withdrawn. It is not reachable from `published`: sunsetting something that is answering, without
 * the notice period in between, is the exact event the whole lifecycle exists to make impossible.
 */
export function sunsetApiContract(contract: ApiContract): ApiContract {
  requireContractTransition(contract, "sunset");
  const now = nowIso();
  return { ...contract, status: "sunset", sunsetAt: contract.sunsetAt ?? now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Published and not yet on notice. */
export const isApiContractPublished = (contract: ApiContract): boolean =>
  contract.status === "published";

/** Answering calls: published, or deprecated and not yet past its sunset. */
export const isApiContractServable = (contract: ApiContract): boolean =>
  isContractServable(contract.status);

/** On notice: still answering, with a date attached and a successor named. */
export const isApiContractDeprecated = (contract: ApiContract): boolean =>
  contract.status === "deprecated";

/**
 * Where the contract stands as of an instant the caller names.
 *
 * A reader rather than a rule: nothing here changes a status, and asking about an instant two years ago is a
 * legitimate question with a legitimate answer. That is what makes *what were we telling callers in March*
 * answerable from the row rather than from a reconstruction of what the scheduler was doing at the time.
 */
export const contractServing = (contract: ApiContract, asOf: ISODateString): ServingVerdict =>
  inspectServing({
    status: contract.status,
    deprecatedAt: contract.deprecatedAt,
    sunsetAt: contract.sunsetAt,
    asOf,
  });
