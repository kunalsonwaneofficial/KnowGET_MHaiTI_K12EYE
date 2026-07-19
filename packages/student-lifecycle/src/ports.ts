import type { TenantId, Uuid } from "@knowget/types";
import type { Applicant } from "./applicant";
import type { EducationalJourney } from "./educational-journey";
import type { IntelligenceProfile } from "./intelligence-profile";
import type { Prospect } from "./prospect";
import type { Student } from "./student";
import type { TimelineEntry } from "./timeline";

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the
 * tenant? Every learner — prospect, applicant, student — is a Person; the lifecycle
 * links to it and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the organization domain (P2-D01-M01): does this organization
 * node (campus / institution) exist in the tenant? Learners attach to it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the membership domain (P2-D01-M04): does this membership exist in
 * the tenant? A student's institutional affiliation is a Membership; the lifecycle
 * links to it rather than duplicating it.
 */
export interface MembershipDirectory {
  exists(tenantId: TenantId, membershipId: Uuid): Promise<boolean>;
}

/** Storage contract for prospects. Tenant-scoped (explicit argument + RLS). */
export interface ProspectRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Prospect | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]>;
  listByTenant(tenantId: TenantId): Promise<Prospect[]>;
  save(prospect: Prospect): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ProspectRepository} — the default for tests and bootstrap. */
export class InMemoryProspectRepository implements ProspectRepository {
  private readonly byId = new Map<string, Prospect>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Prospect | null> {
    const prospect = this.byId.get(id);
    return prospect && prospect.tenantId === tenantId ? prospect : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Prospect[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(prospect: Prospect): Promise<void> {
    this.byId.set(prospect.id, prospect);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const prospect = this.byId.get(id);
    if (prospect && prospect.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for applicants. Tenant-scoped (explicit argument + RLS). */
export interface ApplicantRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Applicant | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Applicant[]>;
  listByTenant(tenantId: TenantId): Promise<Applicant[]>;
  save(applicant: Applicant): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ApplicantRepository} — the default for tests and bootstrap. */
export class InMemoryApplicantRepository implements ApplicantRepository {
  private readonly byId = new Map<string, Applicant>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Applicant | null> {
    const applicant = this.byId.get(id);
    return applicant && applicant.tenantId === tenantId ? applicant : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Applicant[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Applicant[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(applicant: Applicant): Promise<void> {
    this.byId.set(applicant.id, applicant);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const applicant = this.byId.get(id);
    if (applicant && applicant.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for students. Tenant-scoped (explicit argument + RLS). */
export interface StudentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Student | null>;
  findByStudentNumber(tenantId: TenantId, studentNumber: string): Promise<Student | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Student[]>;
  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Student[]>;
  listByTenant(tenantId: TenantId): Promise<Student[]>;
  save(student: Student): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link StudentRepository} — the default for tests and bootstrap. */
export class InMemoryStudentRepository implements StudentRepository {
  private readonly byId = new Map<string, Student>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Student | null> {
    const student = this.byId.get(id);
    return student && student.tenantId === tenantId ? student : null;
  }

  async findByStudentNumber(tenantId: TenantId, studentNumber: string): Promise<Student | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.studentNumber === studentNumber,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Student[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<Student[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.personId === personId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Student[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(student: Student): Promise<void> {
    this.byId.set(student.id, student);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const student = this.byId.get(id);
    if (student && student.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for educational journeys (one per student). Tenant-scoped. */
export interface EducationalJourneyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EducationalJourney | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalJourney | null>;
  listByTenant(tenantId: TenantId): Promise<EducationalJourney[]>;
  save(journey: EducationalJourney): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EducationalJourneyRepository} — the default for tests. */
export class InMemoryEducationalJourneyRepository implements EducationalJourneyRepository {
  private readonly byId = new Map<string, EducationalJourney>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EducationalJourney | null> {
    const journey = this.byId.get(id);
    return journey && journey.tenantId === tenantId ? journey : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalJourney | null> {
    return (
      [...this.byId.values()].find((j) => j.tenantId === tenantId && j.studentId === studentId) ??
      null
    );
  }

  async listByTenant(tenantId: TenantId): Promise<EducationalJourney[]> {
    return [...this.byId.values()].filter((j) => j.tenantId === tenantId);
  }

  async save(journey: EducationalJourney): Promise<void> {
    this.byId.set(journey.id, journey);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const journey = this.byId.get(id);
    if (journey && journey.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for intelligence profiles (one per student). Tenant-scoped. */
export interface IntelligenceProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<IntelligenceProfile | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<IntelligenceProfile | null>;
  listByTenant(tenantId: TenantId): Promise<IntelligenceProfile[]>;
  save(profile: IntelligenceProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link IntelligenceProfileRepository} — the default for tests. */
export class InMemoryIntelligenceProfileRepository implements IntelligenceProfileRepository {
  private readonly byId = new Map<string, IntelligenceProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<IntelligenceProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<IntelligenceProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.studentId === studentId) ??
      null
    );
  }

  async listByTenant(tenantId: TenantId): Promise<IntelligenceProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: IntelligenceProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for timeline entries. Tenant-scoped and **append-only** — there
 * is no update or delete; the institutional history is permanent.
 */
export interface TimelineRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<TimelineEntry | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TimelineEntry[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TimelineEntry[]>;
  listByTenant(tenantId: TenantId): Promise<TimelineEntry[]>;
  save(entry: TimelineEntry): Promise<void>;
}

/** In-memory {@link TimelineRepository} — the default for tests. */
export class InMemoryTimelineRepository implements TimelineRepository {
  private readonly byId = new Map<string, TimelineEntry>();

  async findById(tenantId: TenantId, id: Uuid): Promise<TimelineEntry | null> {
    const entry = this.byId.get(id);
    return entry && entry.tenantId === tenantId ? entry : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TimelineEntry[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TimelineEntry[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<TimelineEntry[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(entry: TimelineEntry): Promise<void> {
    this.byId.set(entry.id, entry);
  }
}
