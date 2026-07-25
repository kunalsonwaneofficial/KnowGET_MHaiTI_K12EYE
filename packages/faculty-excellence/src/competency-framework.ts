import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type Competency, type CompetencyInput, makeCompetency } from "./competency";
import {
  CompetencyNotFoundError,
  DuplicateCompetencyKeyError,
  EmptyFrameworkCodeError,
  EmptyFrameworkNameError,
  FrameworkNotEditableError,
  InvalidFrameworkTransitionError,
} from "./errors";
import type { FrameworkStatus } from "./faculty-value";

/**
 * A competency framework — the institution's professional-practice rubric, a named set of
 * {@link Competency} standards faculty are observed and developed against. It runs `draft → active →
 * archived`; its competencies are editable **only while draft** and are frozen once active, so
 * observations always reference a stable competency set. Each competency `key` is unique within the
 * framework.
 */
export interface CompetencyFramework {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly competencies: readonly Competency[];
  readonly status: FrameworkStatus;
  readonly version: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateFrameworkParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly competencies?: readonly CompetencyInput[];
}

/** Build the competency list, rejecting duplicate keys. */
function buildCompetencies(inputs: readonly CompetencyInput[]): Competency[] {
  const seen = new Set<string>();
  const competencies: Competency[] = [];
  for (const input of inputs) {
    const competency = makeCompetency(input);
    if (seen.has(competency.key)) {
      throw new DuplicateCompetencyKeyError(competency.key);
    }
    seen.add(competency.key);
    competencies.push(competency);
  }
  return competencies;
}

/** Create a competency framework in `draft`. Code and name are required; competencies optional. */
export function createFramework(params: CreateFrameworkParams): CompetencyFramework {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyFrameworkCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyFrameworkNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    description: params.description?.trim() || null,
    competencies: buildCompetencies(params.competencies ?? []),
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  framework: CompetencyFramework,
  patch: Partial<CompetencyFramework>,
): CompetencyFramework => ({
  ...framework,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (framework: CompetencyFramework): void => {
  if (framework.status !== "draft") {
    throw new FrameworkNotEditableError(framework.id, framework.status);
  }
};

/** Rename a framework. */
export function renameFramework(framework: CompetencyFramework, name: string): CompetencyFramework {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyFrameworkNameError();
  }
  return touch(framework, { name: trimmed });
}

/** Set (or clear) the framework description. */
export const setFrameworkDescription = (
  framework: CompetencyFramework,
  description: string | null,
): CompetencyFramework => touch(framework, { description: description?.trim() || null });

/** Add a competency to a draft framework (unique key), bumping the version. */
export function addCompetency(
  framework: CompetencyFramework,
  input: CompetencyInput,
): CompetencyFramework {
  requireDraft(framework);
  const competency = makeCompetency(input);
  if (framework.competencies.some((c) => c.key === competency.key)) {
    throw new DuplicateCompetencyKeyError(competency.key);
  }
  return touch(framework, {
    competencies: [...framework.competencies, competency],
    version: framework.version + 1,
  });
}

/** Remove a competency from a draft framework, bumping the version. */
export function removeCompetency(framework: CompetencyFramework, key: string): CompetencyFramework {
  requireDraft(framework);
  if (!framework.competencies.some((c) => c.key === key)) {
    throw new CompetencyNotFoundError(key);
  }
  return touch(framework, {
    competencies: framework.competencies.filter((c) => c.key !== key),
    version: framework.version + 1,
  });
}

/** Adopt a draft framework (competencies are now frozen). */
export function activateFramework(framework: CompetencyFramework): CompetencyFramework {
  if (framework.status !== "draft") {
    throw new InvalidFrameworkTransitionError(framework.status, "active");
  }
  return touch(framework, { status: "active" });
}

/** Retire an active framework. */
export function archiveFramework(framework: CompetencyFramework): CompetencyFramework {
  if (framework.status !== "active") {
    throw new InvalidFrameworkTransitionError(framework.status, "archived");
  }
  return touch(framework, { status: "archived" });
}

/** Whether the framework is currently active (usable for observations). */
export const isFrameworkActive = (framework: CompetencyFramework): boolean =>
  framework.status === "active";

/** Whether the framework defines the given competency key. */
export const hasCompetency = (framework: CompetencyFramework, key: string): boolean =>
  framework.competencies.some((c) => c.key === key);
