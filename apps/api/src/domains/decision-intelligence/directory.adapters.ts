import {
  ReasoningSessionNotFoundError,
  type ReasoningService,
  ToolNotFoundError,
  type ToolService,
} from "@knowget/agent-orchestration";
import type {
  CapabilityDirectory,
  EvidenceSource,
  EvidenceSourceDirectory,
  OrganizationDirectory,
} from "@knowget/decision-intelligence";
import {
  AssertionNotFoundError,
  type AssertionService,
  KnowledgeEntityNotFoundError,
  type KnowledgeEntityService,
  SemanticRelationshipNotFoundError,
  type SemanticRelationshipService,
} from "@knowget/knowledge-graph";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every recommendation, decision,
 * workflow, case and automation rule hangs off an organization node, and the directory answers existence so the
 * decision layer validates it without depending on `@knowget/organization`.
 */
export class OrganizationServiceDirectory implements OrganizationDirectory {
  constructor(private readonly organizations: OrganizationService) {}

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    try {
      await this.organizations.getById(tenantId, organizationId);
      return true;
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link CapabilityDirectory} backed by the AI capability catalog (P2-D26).
 *
 * A capability key is invocable only when the catalog holds it *and* it is active: a draft has never been
 * cleared to run and a deprecated one has been withdrawn, so both answer `false` here even though the key still
 * resolves. That distinction is the whole point of the check — this domain requests actions by key and never
 * performs them, so a workflow stage or automation rule naming a key that cannot actually be invoked is a
 * process that will fail at the moment it matters rather than at the moment it is written.
 *
 * The check runs at write time in three places (attaching a stage, publishing a workflow, arming a rule) and the
 * answer is deliberately not cached: a capability can be deprecated between two of those moments, and a stale
 * `true` is how a retired capability ends up armed.
 */
export class ToolCatalogCapabilityDirectory implements CapabilityDirectory {
  constructor(private readonly tools: ToolService) {}

  async isInvocable(tenantId: TenantId, capabilityKey: string): Promise<boolean> {
    try {
      const tool = await this.tools.getByKey(tenantId, capabilityKey);
      return tool.status === "active";
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link EvidenceSourceDirectory} backed by the knowledge graph (P2-D25) and the AI runtime (P2-D26).
 *
 * This adapter is what makes the contract's second rule enforceable rather than aspirational. The domain limits
 * *where* evidence may come from — the vocabulary has exactly two sources and no room for a spreadsheet or an
 * unsupported model opinion — but only the composition root can answer whether a particular citation actually
 * resolves. Without this check a recommendation could cite a graph assertion id that has never existed and still
 * look grounded; with it, an unresolvable citation is rejected at the moment it is attached.
 *
 * A `knowledge_graph` reference may name an entity, a relationship or an assertion, because all three are things
 * the graph asserts and any of them can be the grounds for a recommendation. They are tried in that order and
 * the first hit wins. Each service call is a tenant-scoped read, so a reference into another institution's graph
 * resolves to nothing here exactly as it does everywhere else.
 *
 * A non-UUID reference short-circuits to `false` rather than reaching the store. Both sources are keyed by UUID,
 * so a malformed reference cannot resolve; letting it through would trade a clean "this evidence does not exist"
 * for a driver-level cast error at the edge of an unrelated request.
 */
export class PlatformEvidenceSourceDirectory implements EvidenceSourceDirectory {
  constructor(
    private readonly entities: KnowledgeEntityService,
    private readonly relationships: SemanticRelationshipService,
    private readonly assertions: AssertionService,
    private readonly sessions: ReasoningService,
  ) {}

  async exists(tenantId: TenantId, source: EvidenceSource, ref: string): Promise<boolean> {
    const trimmed = ref.trim();
    if (!isUuid(trimmed)) {
      return false;
    }
    const id = trimmed as Uuid;
    return source === "knowledge_graph"
      ? await this.existsInGraph(tenantId, id)
      : await this.existsAsSession(tenantId, id);
  }

  /** An entity, a relationship or an assertion — the three things the graph can be cited for. */
  private async existsInGraph(tenantId: TenantId, id: Uuid): Promise<boolean> {
    try {
      await this.entities.getById(tenantId, id);
      return true;
    } catch (error) {
      if (!(error instanceof KnowledgeEntityNotFoundError)) {
        throw error;
      }
    }
    try {
      await this.relationships.getById(tenantId, id);
      return true;
    } catch (error) {
      if (!(error instanceof SemanticRelationshipNotFoundError)) {
        throw error;
      }
    }
    try {
      await this.assertions.getById(tenantId, id);
      return true;
    } catch (error) {
      if (error instanceof AssertionNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  private async existsAsSession(tenantId: TenantId, id: Uuid): Promise<boolean> {
    try {
      await this.sessions.get(tenantId, id);
      return true;
    } catch (error) {
      if (error instanceof ReasoningSessionNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
