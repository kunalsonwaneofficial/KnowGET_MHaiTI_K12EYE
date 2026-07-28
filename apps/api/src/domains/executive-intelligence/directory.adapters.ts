import { EvaluationNotFoundError, type EvaluationService } from "@knowget/assessment-evaluation";
import { DecisionRecordNotFoundError, type DecisionService } from "@knowget/decision-intelligence";
import type {
  EvidenceCitation,
  EvidenceKind,
  EvidenceRecordDirectory,
  OrganizationDirectory,
} from "@knowget/executive-intelligence";
import {
  AssertionNotFoundError,
  type AssertionService,
  type KnowledgeEntityService,
} from "@knowget/knowledge-graph";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import {
  ForecastRunNotFoundError,
  type ForecastRunService,
} from "@knowget/predictive-intelligence";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every indicator, index,
 * dashboard, briefing and attention item hangs off an organization node, and the directory answers existence so
 * the command layer validates it without depending on `@knowget/organization`.
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

/** Evidence kinds whose store this adapter can name, resolved without going through the graph. */
const ASSESSMENT_RESULT: EvidenceKind = "assessment_result";
const FORECAST_RUN: EvidenceKind = "forecast_run";
const DECISION_RECORD: EvidenceKind = "decision_record";
const KNOWLEDGE_ASSERTION: EvidenceKind = "knowledge_assertion";

/**
 * {@link EvidenceRecordDirectory} backed by four record services and the knowledge graph (P2-D25) behind them.
 *
 * This adapter is what makes the contract's third clause — evidence-traceable KPIs — true rather than declared.
 * The domain refuses to construct a reading without a citation, but a citation is only a `(kind, sourceDomain,
 * sourceRef)` triple: the package cannot tell a reference to a real evaluation from a plausible-looking string,
 * and without something that can, "traceable" would mean nothing more than "shaped like a trace".
 *
 * Four kinds have a store this platform can name, and they are resolved directly: an `assessment_result` through
 * Assessment & Evaluation (P2-D10), a `forecast_run` through Predictive Intelligence (P2-D28), a
 * `decision_record` through Decision Intelligence (P2-D27) and a `knowledge_assertion` through the graph's own
 * assertions. Their refs are record identifiers, so a malformed one short-circuits to `false` rather than
 * reaching the store.
 *
 * The remaining three — `domain_record`, `audit_finding` and `manual_return` — go to the graph by
 * `(sourceDomain, sourceRef)`. That is the right resolution rather than a convenient one for `domain_record`,
 * which is deliberately open: twenty-eight contracts own records a KPI might stand on and no single service
 * resolves them all, while indexing institutional records by source pair is exactly what the graph is for. For
 * `audit_finding` it is also the only resolution available — no audit-finding service exists anywhere in the
 * platform yet, and inventing a check that always passed would be worse than routing the question somewhere it
 * can actually be answered. A `manual_return` is a number a human typed, which is precisely why the domain
 * already demands an attestor for it; the graph entry is what the attestor is standing behind.
 *
 * An unresolvable citation answers `false` and the domain refuses the reading. That is deliberate and it is the
 * only honest answer available: a directory that returned `true` for kinds it does not know would leave the
 * aggregate's guard running on every request and checking nothing on most of them, which is worse than no guard
 * because it reads like one. The operational cost is real — a figure whose source the graph has never seen
 * cannot be filed until the source is registered — and it is the intended shape, because an indicator citing
 * evidence nobody can reach is an unsourced number wearing a citation.
 *
 * Record state is deliberately not consulted. A reopened evaluation and a superseded forecast run are still the
 * records a past reading was taken from, and a reading is a statement about a moment; withdrawing figures
 * because their source later moved on would rewrite a series whose whole value is that it did not move.
 */
export class PlatformEvidenceRecordDirectory implements EvidenceRecordDirectory {
  constructor(
    private readonly evaluations: EvaluationService,
    private readonly forecastRuns: ForecastRunService,
    private readonly decisions: DecisionService,
    private readonly assertions: AssertionService,
    private readonly entities: KnowledgeEntityService,
  ) {}

  async exists(tenantId: TenantId, citation: EvidenceCitation): Promise<boolean> {
    const { kind, sourceDomain, sourceRef } = citation;
    if (
      kind === ASSESSMENT_RESULT ||
      kind === FORECAST_RUN ||
      kind === DECISION_RECORD ||
      kind === KNOWLEDGE_ASSERTION
    ) {
      return isUuid(sourceRef)
        ? await this.existsAsRecord(tenantId, kind, sourceRef as Uuid)
        : false;
    }
    return (await this.entities.getBySource(tenantId, sourceDomain, sourceRef)) !== null;
  }

  /** One of the four kinds resolved without the graph. */
  private async existsAsRecord(tenantId: TenantId, kind: EvidenceKind, id: Uuid): Promise<boolean> {
    try {
      if (kind === ASSESSMENT_RESULT) {
        await this.evaluations.getById(tenantId, id);
      } else if (kind === FORECAST_RUN) {
        await this.forecastRuns.get(tenantId, id);
      } else if (kind === DECISION_RECORD) {
        await this.decisions.get(tenantId, id);
      } else {
        await this.assertions.getById(tenantId, id);
      }
      return true;
    } catch (error) {
      if (
        error instanceof AssertionNotFoundError ||
        error instanceof DecisionRecordNotFoundError ||
        error instanceof EvaluationNotFoundError ||
        error instanceof ForecastRunNotFoundError
      ) {
        return false;
      }
      throw error;
    }
  }
}
