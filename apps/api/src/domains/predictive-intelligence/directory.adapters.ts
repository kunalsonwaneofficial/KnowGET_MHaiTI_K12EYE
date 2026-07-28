import { type KnowledgeEntityService } from "@knowget/knowledge-graph";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type {
  OrganizationDirectory,
  PersonDirectory,
  SeriesSubjectDirectory,
} from "@knowget/predictive-intelligence";
import { isUuid } from "@knowget/shared";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every series, model,
 * scenario and plan hangs off an organization node, and the directory answers existence so the predictive
 * layer validates it without depending on `@knowget/organization`.
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
 * Four things in this domain name a person: who produced a forecast run, who scored a model, who ran a
 * simulation and who activated, closed or reviewed a plan. A fifth is the holder of an `expert_judgement`
 * assumption, and that one is why the check is not cosmetic — the contract requires a forecast to declare its
 * assumptions, and an assumption attributed to a person who does not exist declares nothing while looking
 * like it declares something. Attribution the platform cannot resolve is refused at the moment it is made.
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

/** Source domains this adapter resolves directly, without going through the graph. */
const ORGANIZATION_DOMAIN = "organization";
const PERSON_DOMAIN = "person";
const STUDENT_DOMAIN = "student";

/**
 * {@link SeriesSubjectDirectory} backed by three record services and the knowledge graph (P2-D25) behind them.
 *
 * A subject-scoped series is about *something*: attendance for one grade section, cash flow for one cost
 * centre, demand on one transport route, occupancy in one hostel block. Twenty-four domains own such things
 * and there is no single service that resolves them all, so this adapter resolves what it can name and asks
 * the graph about everything else. The graph is the right fallback rather than a convenient one — indexing
 * institutional records by `(sourceDomain, sourceRef)` is exactly what it is for, and the question this port
 * asks is exactly that lookup.
 *
 * The three named domains are resolved directly because they are the records most likely to carry a series
 * and the ones whose existence must not depend on whether a tenant has populated its graph yet. Their refs
 * are UUIDs, so a malformed one short-circuits to `false` rather than reaching the store; graph refs are
 * opaque by design and are passed through untouched.
 *
 * An unresolvable subject answers `false` and the domain refuses the series. That is deliberate and it is the
 * only honest answer available: a directory that returned `true` for domains it does not know would leave the
 * aggregate's guard running on every request and checking nothing on most of them, which is worse than no
 * guard because it reads like one. The operational cost is real — a series about a subject the graph has
 * never seen cannot be declared until the subject is registered — and it is the intended shape, because a
 * forecast about a subject the institution cannot identify is a number attributed to nothing.
 *
 * Entity status is deliberately not consulted. A closed cost centre and a discontinued route are archived
 * records that institutions still hold and still finish the history of, and this domain already has a state
 * for that: the series is closed, not forbidden.
 */
export class PlatformSeriesSubjectDirectory implements SeriesSubjectDirectory {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly people: PersonService,
    private readonly students: StudentService,
    private readonly entities: KnowledgeEntityService,
  ) {}

  async exists(tenantId: TenantId, sourceDomain: string, subjectRef: string): Promise<boolean> {
    const domain = sourceDomain.trim().toLowerCase();
    const ref = subjectRef.trim();
    if (domain === ORGANIZATION_DOMAIN || domain === PERSON_DOMAIN || domain === STUDENT_DOMAIN) {
      return isUuid(ref) ? await this.existsAsRecord(tenantId, domain, ref as Uuid) : false;
    }
    return (await this.entities.getBySource(tenantId, domain, ref)) !== null;
  }

  /** One of the three domains resolved without the graph. */
  private async existsAsRecord(tenantId: TenantId, domain: string, id: Uuid): Promise<boolean> {
    try {
      if (domain === ORGANIZATION_DOMAIN) {
        await this.organizations.getById(tenantId, id);
      } else if (domain === PERSON_DOMAIN) {
        await this.people.getById(tenantId, id);
      } else {
        await this.students.getById(tenantId, id);
      }
      return true;
    } catch (error) {
      if (
        error instanceof OrganizationNotFoundError ||
        error instanceof PersonNotFoundError ||
        error instanceof StudentNotFoundError
      ) {
        return false;
      }
      throw error;
    }
  }
}
