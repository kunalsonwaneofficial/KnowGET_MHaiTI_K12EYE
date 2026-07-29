import { EvaluationNotFoundError, type EvaluationService } from "@knowget/assessment-evaluation";
import { DecisionRecordNotFoundError, type DecisionService } from "@knowget/decision-intelligence";
import {
  AttentionItemNotFoundError,
  type AttentionItemService,
} from "@knowget/executive-intelligence";
import {
  AssertionNotFoundError,
  type AssertionService,
  type KnowledgeEntityService,
  type KnowledgeMemoryService,
  isKnowledgeEntityActive,
} from "@knowget/knowledge-graph";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type {
  EvidenceCitation,
  EvidenceKind,
  EvidenceRecordDirectory,
  InstitutionalMemoryDirectory,
  OrganizationDirectory,
  PersonDirectory,
} from "@knowget/platform-evolution";
import {
  ForecastRunNotFoundError,
  type ForecastRunService,
} from "@knowget/predictive-intelligence";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every signal, initiative,
 * gate, lesson, cycle, assessment and adoption review hangs off an organization node, and the directory answers
 * existence so the evolution layer validates it without depending on `@knowget/organization`.
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
 * {@link PersonDirectory} backed by the person service (P2-D01-M02).
 *
 * This is the check that makes the contract's second rule structural rather than stated. A gate clears when a
 * required number of *distinct named people* have agreed, so the identity of a decider is not decoration on the
 * ballot — it is the quantity being counted. A ballot cast by a person the platform cannot resolve would let a
 * three-decider gate be cleared by one caller inventing two colleagues, and the governance the contract exists
 * to guarantee would be an arithmetic check over strings.
 *
 * Everything else the domain attributes runs through the same door for the same reason at lower stakes: who
 * raised a signal, who declined it, who proposed a change and withdrew it, who signed a lesson into memory, who
 * opened and closed a cycle, who published a maturity index. An institution reading its own improvement record
 * three years later needs the names in it to still mean somebody.
 */
export class PersonServiceDirectory implements PersonDirectory {
  constructor(private readonly people: PersonService) {}

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    try {
      await this.people.getById(tenantId, personId);
      return true;
    } catch (error) {
      if (error instanceof PersonNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** Evidence kinds whose store this adapter can name, resolved without going through the graph. */
const ATTENTION_ITEM: EvidenceKind = "attention_item";
const ASSESSMENT_RESULT: EvidenceKind = "assessment_result";
const FORECAST_RUN: EvidenceKind = "forecast_run";
const DECISION_RECORD: EvidenceKind = "decision_record";
const KNOWLEDGE_ASSERTION: EvidenceKind = "knowledge_assertion";

/**
 * {@link EvidenceRecordDirectory} backed by five record services and the knowledge graph (P2-D25) behind them.
 *
 * This adapter is the difference between institutional memory and institutional rumour. The domain refuses to
 * raise a signal, record a lesson or score a maturity area without a citation, but a citation is only a
 * `(kind, sourceDomain, sourceRef)` triple: the package cannot tell a reference to a real attention item from a
 * plausible-looking string, and without something that can, "evidence" would mean nothing more than
 * "shaped like evidence". An improvement domain is the easiest place in a platform for somebody's strong
 * opinion to acquire a primary key and be quoted years later as something the institution established, and this
 * check is the only thing standing in the way of that.
 *
 * Five kinds have a store this platform can name, and they are resolved directly: an `attention_item` through
 * Executive Intelligence (P2-D29), an `assessment_result` through Assessment & Evaluation (P2-D10), a
 * `forecast_run` through Predictive Intelligence (P2-D28), a `decision_record` through Decision Intelligence
 * (P2-D27) and a `knowledge_assertion` through the graph's own assertions. Their refs are record identifiers, so
 * a malformed one short-circuits to `false` rather than reaching the store.
 *
 * The remaining three — `domain_record`, `audit_finding` and `attested_return` — go to the graph by
 * `(sourceDomain, sourceRef)`. That is the right resolution rather than a convenient one for `domain_record`,
 * which is deliberately open: twenty-nine contracts own records an improvement signal might stand on and no
 * single service resolves them all, while indexing institutional records by source pair is exactly what the
 * graph is for. For `audit_finding` it is also the only resolution available — no audit-finding service exists
 * anywhere in the platform yet, and inventing a check that always passed would be worse than routing the
 * question somewhere it can actually be answered. An `attested_return` is a judgement a named person signed,
 * which is precisely why the domain already demands an attestor for it; the graph entry is what the attestor is
 * standing behind, and requiring it is what stops the escape hatch becoming an untyped free-text field.
 *
 * An unresolvable citation answers `false` and the domain refuses the record. That is deliberate and it is the
 * only honest answer available: a directory that returned `true` for kinds it does not know would leave the
 * aggregate's guard running on every request and checking nothing on most of them, which is worse than no guard
 * because it reads like one. The operational cost is real — a signal whose source the graph has never seen
 * cannot be raised until the source is registered — and it is the intended shape, because a lesson citing
 * evidence nobody can reach is folklore wearing a citation.
 *
 * Record state is deliberately not consulted. A resolved attention item, a reopened evaluation and a superseded
 * forecast run are still the records the observation was made from, and a signal is a statement about a moment.
 * Invalidating the institution's own account of why it changed something, because the thing that prompted it
 * was later closed, would erase exactly the history this contract exists to keep.
 */
export class PlatformEvidenceRecordDirectory implements EvidenceRecordDirectory {
  constructor(
    private readonly attention: AttentionItemService,
    private readonly evaluations: EvaluationService,
    private readonly forecastRuns: ForecastRunService,
    private readonly decisions: DecisionService,
    private readonly assertions: AssertionService,
    private readonly entities: KnowledgeEntityService,
  ) {}

  async exists(tenantId: TenantId, citation: EvidenceCitation): Promise<boolean> {
    const { kind, sourceDomain, sourceRef } = citation;
    if (
      kind === ATTENTION_ITEM ||
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

  /** One of the five kinds resolved without the graph. */
  private async existsAsRecord(tenantId: TenantId, kind: EvidenceKind, id: Uuid): Promise<boolean> {
    try {
      if (kind === ATTENTION_ITEM) {
        await this.attention.get(tenantId, id);
      } else if (kind === ASSESSMENT_RESULT) {
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
        error instanceof AttentionItemNotFoundError ||
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

/** The source domain under which a lesson is registered in the knowledge graph. */
const LESSON_SOURCE_DOMAIN = "platform-evolution";

/**
 * {@link InstitutionalMemoryDirectory} backed by the knowledge graph (P2-D25).
 *
 * This is the adapter the contract's first clause stands on — *lessons feed institutional memory* — and it is
 * the one place in the domain where that sentence stops being a slogan. `LESSON_RETENTIONS` has no member
 * meaning "written down somewhere", so a lesson stays `provisional` until this directory says a commitment
 * resolved. Every institution already owns a folder of retrospectives nobody can query; the difference between
 * that folder and memory is whether the conclusion was committed somewhere the institution actually reads from,
 * and only the graph can answer that.
 *
 * A commitment has resolved when three things hold. The lesson has been registered in the graph as an entity
 * under `(platform-evolution, lessonKey)` — the key, not an identifier, because the port asks by key precisely
 * so a commitment made later by a different route still resolves for the lesson it was made about. That entity
 * is active and belongs to the organization the lesson belongs to, which is what stops one school's lesson
 * being retained on another's commitment inside a shared tenant. And at least one *grounded* assertion still
 * stands about it: a `declared` or `observed` claim, meaning somebody stated it or a source system showed it,
 * rather than something the graph merely inferred.
 *
 * Grounding is the load-bearing part of that third condition and is not a technicality. An assertion derived or
 * inferred from other assertions bottoms out in whatever those rested on; if the whole chain under a lesson were
 * inference, the institution would have concluded something and then remembered its own conclusion as evidence
 * for itself. Requiring a grounded claim means what made the lesson stick was an observation or a signature.
 *
 * The consequence is that `retain` fails routinely, and that is the intervention rather than a defect in it. An
 * institution running this platform gets a real number for how much of what it concluded actually reached
 * memory, and a retrospective that produced twelve insights and committed none of them reads as twelve
 * unfinished records rather than as a completed retrospective.
 */
export class KnowledgeGraphMemoryDirectory implements InstitutionalMemoryDirectory {
  constructor(
    private readonly entities: KnowledgeEntityService,
    private readonly memories: KnowledgeMemoryService,
  ) {}

  async commitmentResolved(
    tenantId: TenantId,
    organizationId: Uuid,
    lessonKey: string,
  ): Promise<boolean> {
    const entity = await this.entities.getBySource(tenantId, LESSON_SOURCE_DOMAIN, lessonKey);
    if (!entity || entity.organizationId !== organizationId || !isKnowledgeEntityActive(entity)) {
      return false;
    }
    const memory = await this.memories.memoryForEntity(tenantId, entity.id);
    return memory.groundedAssertionCount > 0;
  }
}
