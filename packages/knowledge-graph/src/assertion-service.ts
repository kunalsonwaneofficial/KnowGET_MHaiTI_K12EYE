import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Assertion,
  type CreateAssertionParams,
  createAssertion,
  isAssertionStanding,
  retractAssertion,
} from "./assertion";
import { assertionMade, assertionRetracted } from "./knowledge-events";
import { isGroundedMethod } from "./knowledge-value";
import type { AssertionView, Explanation } from "./knowledge-view";
import { effectiveConfidence, evidenceChain, explain, isExplainable } from "./provenance";
import {
  AssertionNotFoundError,
  OrganizationNotFoundForKnowledgeError,
  UnknownAssertionSubjectError,
  UnknownDerivedFromError,
} from "./errors";
import type {
  AssertionRepository,
  KnowledgeEntityRepository,
  OrganizationDirectory,
  SemanticRelationshipRepository,
} from "./ports";

export interface AssertionServiceDeps {
  readonly repository: AssertionRepository;
  readonly entities: KnowledgeEntityRepository;
  readonly relationships: SemanticRelationshipRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/** The provenance bundle for an assertion — its explanation tree and the derived facts about explainability. */
export interface ProvenanceReport {
  readonly explanation: Explanation | null;
  readonly evidenceChain: readonly string[];
  readonly explainable: boolean;
  readonly effectiveConfidence: number;
}

/**
 * Application service for assertions — the evidence chain. Making an assertion validates the owning
 * organization, that the subject (entity or relationship) exists, and — for a derived/inferred assertion — that
 * every cited antecedent is a standing assertion (so the chain never dangles). It retracts a claim (never edits
 * it) and reports provenance by running the pure provenance engine over the tenant's standing assertions. This
 * is where the contract's rule — every assertion carries an evidence chain and is explainable — is enforced.
 */
export class AssertionService {
  private readonly repository: AssertionRepository;
  private readonly entities: KnowledgeEntityRepository;
  private readonly relationships: SemanticRelationshipRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AssertionServiceDeps) {
    this.repository = deps.repository;
    this.entities = deps.entities;
    this.relationships = deps.relationships;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async make(input: CreateAssertionParams): Promise<Assertion> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForKnowledgeError(input.organizationId);
    }
    await this.requireSubject(input.tenantId, input.subjectKind, input.subjectId);
    if (!isGroundedMethod(input.method)) {
      await this.requireStandingAntecedents(input.tenantId, input.derivedFrom ?? []);
    }
    const assertion = createAssertion(input);
    await this.repository.save(assertion);
    await this.emit(assertionMade(assertion));
    return assertion;
  }

  async retract(tenantId: TenantId, id: Uuid): Promise<Assertion> {
    const updated = retractAssertion(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(assertionRetracted(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Assertion> {
    return this.require(tenantId, id);
  }

  async listForSubject(
    tenantId: TenantId,
    subjectKind: "entity" | "relationship",
    subjectId: Uuid,
  ): Promise<Assertion[]> {
    return this.repository.listBySubject(tenantId, subjectKind, subjectId);
  }

  /**
   * Explain an assertion: its derivation tree, the grounded evidence chain, whether it is fully explainable and
   * its evidence-capped effective confidence — the provenance engine run over the tenant's *standing* assertions
   * (so a retracted antecedent counts as withdrawn). Returns `null` explanation if the assertion is unknown.
   */
  async explainAssertion(tenantId: TenantId, id: Uuid): Promise<ProvenanceReport> {
    const all = await this.repository.listByTenant(tenantId);
    const pool: AssertionView[] = all.filter(isAssertionStanding).map((a) => ({
      id: a.id,
      method: a.method,
      confidence: a.confidence,
      derivedFrom: a.derivedFrom,
      status: a.status,
    }));
    return {
      explanation: explain(id, pool),
      evidenceChain: evidenceChain(id, pool),
      explainable: isExplainable(id, pool),
      effectiveConfidence: effectiveConfidence(id, pool),
    };
  }

  private async requireSubject(
    tenantId: TenantId,
    subjectKind: "entity" | "relationship",
    subjectId: Uuid,
  ): Promise<void> {
    const found =
      subjectKind === "entity"
        ? await this.entities.findById(tenantId, subjectId)
        : await this.relationships.findById(tenantId, subjectId);
    if (!found) {
      throw new UnknownAssertionSubjectError(subjectKind, subjectId);
    }
  }

  private async requireStandingAntecedents(
    tenantId: TenantId,
    derivedFrom: readonly Uuid[],
  ): Promise<void> {
    const wanted = [...new Set(derivedFrom)];
    const found = await this.repository.findManyByIds(tenantId, wanted);
    const standing = new Set(found.filter(isAssertionStanding).map((a) => a.id));
    for (const id of wanted) {
      if (!standing.has(id)) {
        throw new UnknownDerivedFromError(id);
      }
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Assertion> {
    const assertion = await this.repository.findById(tenantId, id);
    if (!assertion) {
      throw new AssertionNotFoundError(id);
    }
    return assertion;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
