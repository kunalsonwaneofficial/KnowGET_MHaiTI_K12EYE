import type { TenantId, Uuid } from "@knowget/types";
import type { AlumniChapter } from "./alumni-chapter";
import type { AlumniEngagementProfile } from "./alumni-engagement-profile";
import type { AlumniEvent } from "./alumni-event";
import type { AlumniProfile } from "./alumni-profile";
import type { ChapterMembership } from "./chapter-membership";
import type { Contribution } from "./contribution";
import type { EventRegistration } from "./event-registration";
import type { MentorshipConnection } from "./mentorship-connection";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every alumni record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? An alumnus is a Person; the domain
 * links to them and never re-models them. The prospect/applicant/student/alumnus lifecycle record is Student
 * Lifecycle's (P2-D03), referenced by id.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Storage contract for alumni profiles — the network-membership anchor. Tenant-scoped (explicit argument +
 * RLS). `findByAlumnusPersonId` backs the one-profile-per-person rule.
 */
export interface AlumniProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile | null>;
  findByAlumnusPersonId(tenantId: TenantId, alumnusPersonId: Uuid): Promise<AlumniProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]>;
  listByTenant(tenantId: TenantId): Promise<AlumniProfile[]>;
  save(profile: AlumniProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AlumniProfileRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniProfileRepository implements AlumniProfileRepository {
  private readonly byId = new Map<string, AlumniProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByAlumnusPersonId(
    tenantId: TenantId,
    alumnusPersonId: Uuid,
  ): Promise<AlumniProfile | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.alumnusPersonId === alumnusPersonId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: AlumniProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for alumni chapters. Tenant-scoped (explicit argument + RLS). */
export interface AlumniChapterRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter | null>;
  findByCode(tenantId: TenantId, code: string): Promise<AlumniChapter | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]>;
  listByTenant(tenantId: TenantId): Promise<AlumniChapter[]>;
  save(chapter: AlumniChapter): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AlumniChapterRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniChapterRepository implements AlumniChapterRepository {
  private readonly byId = new Map<string, AlumniChapter>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter | null> {
    const chapter = this.byId.get(id);
    return chapter && chapter.tenantId === tenantId ? chapter : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<AlumniChapter | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniChapter[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(chapter: AlumniChapter): Promise<void> {
    this.byId.set(chapter.id, chapter);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const chapter = this.byId.get(id);
    if (chapter && chapter.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for chapter memberships. Tenant-scoped (explicit argument + RLS). `findByChapterAndAlumnus`
 * backs the one-membership-per-(chapter, alumnus) rule (rejoin reactivates); `countActiveByAlumnus` is the
 * active-chapter count the engagement engine reads.
 */
export interface ChapterMembershipRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ChapterMembership | null>;
  findByChapterAndAlumnus(
    tenantId: TenantId,
    chapterId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<ChapterMembership | null>;
  listByChapter(tenantId: TenantId, chapterId: Uuid): Promise<ChapterMembership[]>;
  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<ChapterMembership[]>;
  countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<ChapterMembership[]>;
  save(membership: ChapterMembership): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ChapterMembershipRepository} — the default for tests and bootstrap. */
export class InMemoryChapterMembershipRepository implements ChapterMembershipRepository {
  private readonly byId = new Map<string, ChapterMembership>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ChapterMembership | null> {
    const membership = this.byId.get(id);
    return membership && membership.tenantId === tenantId ? membership : null;
  }

  async findByChapterAndAlumnus(
    tenantId: TenantId,
    chapterId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<ChapterMembership | null> {
    return (
      [...this.byId.values()].find(
        (m) =>
          m.tenantId === tenantId &&
          m.chapterId === chapterId &&
          m.alumniProfileId === alumniProfileId,
      ) ?? null
    );
  }

  async listByChapter(tenantId: TenantId, chapterId: Uuid): Promise<ChapterMembership[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.chapterId === chapterId,
    );
  }

  async listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<ChapterMembership[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.alumniProfileId === alumniProfileId,
    );
  }

  async countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return (await this.listByAlumnus(tenantId, alumniProfileId)).filter(
      (m) => m.status === "active",
    ).length;
  }

  async listByTenant(tenantId: TenantId): Promise<ChapterMembership[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId);
  }

  async save(membership: ChapterMembership): Promise<void> {
    this.byId.set(membership.id, membership);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const membership = this.byId.get(id);
    if (membership && membership.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for alumni events. Tenant-scoped (explicit argument + RLS). */
export interface AlumniEventRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AlumniEvent | null>;
  findByCode(tenantId: TenantId, code: string): Promise<AlumniEvent | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniEvent[]>;
  listByTenant(tenantId: TenantId): Promise<AlumniEvent[]>;
  save(event: AlumniEvent): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AlumniEventRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniEventRepository implements AlumniEventRepository {
  private readonly byId = new Map<string, AlumniEvent>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AlumniEvent | null> {
    const event = this.byId.get(id);
    return event && event.tenantId === tenantId ? event : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<AlumniEvent | null> {
    return [...this.byId.values()].find((e) => e.tenantId === tenantId && e.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniEvent[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniEvent[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(event: AlumniEvent): Promise<void> {
    this.byId.set(event.id, event);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const event = this.byId.get(id);
    if (event && event.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for event registrations. Tenant-scoped (explicit argument + RLS). `findByEventAndAlumnus`
 * backs the one-registration-per-(event, alumnus) rule (reinstate on return); `countConfirmedByEvent` (not
 * cancelled) and `countAttendedByEvent` feed the participation engine; `countAttendedByAlumnus` feeds the
 * engagement engine.
 */
export interface EventRegistrationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EventRegistration | null>;
  findByEventAndAlumnus(
    tenantId: TenantId,
    eventId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<EventRegistration | null>;
  listByEvent(tenantId: TenantId, eventId: Uuid): Promise<EventRegistration[]>;
  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<EventRegistration[]>;
  countConfirmedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number>;
  countAttendedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number>;
  countAttendedByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<EventRegistration[]>;
  save(registration: EventRegistration): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EventRegistrationRepository} — the default for tests and bootstrap. */
export class InMemoryEventRegistrationRepository implements EventRegistrationRepository {
  private readonly byId = new Map<string, EventRegistration>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EventRegistration | null> {
    const registration = this.byId.get(id);
    return registration && registration.tenantId === tenantId ? registration : null;
  }

  async findByEventAndAlumnus(
    tenantId: TenantId,
    eventId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<EventRegistration | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId && r.eventId === eventId && r.alumniProfileId === alumniProfileId,
      ) ?? null
    );
  }

  async listByEvent(tenantId: TenantId, eventId: Uuid): Promise<EventRegistration[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId && r.eventId === eventId);
  }

  async listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<EventRegistration[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.alumniProfileId === alumniProfileId,
    );
  }

  async countConfirmedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number> {
    return (await this.listByEvent(tenantId, eventId)).filter((r) => r.status !== "cancelled")
      .length;
  }

  async countAttendedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number> {
    return (await this.listByEvent(tenantId, eventId)).filter((r) => r.status === "attended")
      .length;
  }

  async countAttendedByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return (await this.listByAlumnus(tenantId, alumniProfileId)).filter(
      (r) => r.status === "attended",
    ).length;
  }

  async listByTenant(tenantId: TenantId): Promise<EventRegistration[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(registration: EventRegistration): Promise<void> {
    this.byId.set(registration.id, registration);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const registration = this.byId.get(id);
    if (registration && registration.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for mentorship connections. Tenant-scoped (explicit argument + RLS). `listByAlumnus`
 * returns the connections where the alumnus is mentor or mentee; `countActiveByAlumnus` is the active-mentorship
 * count the engagement engine reads.
 */
export interface MentorshipConnectionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MentorshipConnection | null>;
  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<MentorshipConnection[]>;
  countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<MentorshipConnection[]>;
  save(connection: MentorshipConnection): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link MentorshipConnectionRepository} — the default for tests and bootstrap. */
export class InMemoryMentorshipConnectionRepository implements MentorshipConnectionRepository {
  private readonly byId = new Map<string, MentorshipConnection>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MentorshipConnection | null> {
    const connection = this.byId.get(id);
    return connection && connection.tenantId === tenantId ? connection : null;
  }

  async listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<MentorshipConnection[]> {
    return [...this.byId.values()].filter(
      (c) =>
        c.tenantId === tenantId &&
        (c.mentorProfileId === alumniProfileId || c.menteeProfileId === alumniProfileId),
    );
  }

  async countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return (await this.listByAlumnus(tenantId, alumniProfileId)).filter(
      (c) => c.status === "active",
    ).length;
  }

  async listByTenant(tenantId: TenantId): Promise<MentorshipConnection[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(connection: MentorshipConnection): Promise<void> {
    this.byId.set(connection.id, connection);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const connection = this.byId.get(id);
    if (connection && connection.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for contributions — an append-only giving log per alumnus. Tenant-scoped (explicit argument
 * + RLS). `countByAlumnus` is the contribution count the engagement engine reads. There is no `remove`:
 * contributions are immutable facts.
 */
export interface ContributionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Contribution | null>;
  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<Contribution[]>;
  countByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<Contribution[]>;
  save(contribution: Contribution): Promise<void>;
}

/** In-memory {@link ContributionRepository} — the default for tests and bootstrap. */
export class InMemoryContributionRepository implements ContributionRepository {
  private readonly byId = new Map<string, Contribution>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Contribution | null> {
    const contribution = this.byId.get(id);
    return contribution && contribution.tenantId === tenantId ? contribution : null;
  }

  async listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<Contribution[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.alumniProfileId === alumniProfileId,
    );
  }

  async countByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return (await this.listByAlumnus(tenantId, alumniProfileId)).length;
  }

  async listByTenant(tenantId: TenantId): Promise<Contribution[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(contribution: Contribution): Promise<void> {
    this.byId.set(contribution.id, contribution);
  }
}

/**
 * Storage contract for alumni engagement profiles — the derived per-alumnus projection. Tenant-scoped
 * (explicit argument + RLS). One profile per alumni profile (`findByAlumnus`); the refresh spine upserts
 * through `save`.
 */
export interface AlumniEngagementProfileRepository {
  findByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<AlumniEngagementProfile | null>;
  listByTenant(tenantId: TenantId): Promise<AlumniEngagementProfile[]>;
  save(profile: AlumniEngagementProfile): Promise<void>;
}

/** In-memory {@link AlumniEngagementProfileRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniEngagementProfileRepository implements AlumniEngagementProfileRepository {
  private readonly byAlumnus = new Map<string, AlumniEngagementProfile>();

  private key(tenantId: TenantId, alumniProfileId: Uuid): string {
    return `${tenantId}:${alumniProfileId}`;
  }

  async findByAlumnus(
    tenantId: TenantId,
    alumniProfileId: Uuid,
  ): Promise<AlumniEngagementProfile | null> {
    return this.byAlumnus.get(this.key(tenantId, alumniProfileId)) ?? null;
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniEngagementProfile[]> {
    return [...this.byAlumnus.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: AlumniEngagementProfile): Promise<void> {
    this.byAlumnus.set(this.key(profile.tenantId, profile.alumniProfileId), profile);
  }
}
