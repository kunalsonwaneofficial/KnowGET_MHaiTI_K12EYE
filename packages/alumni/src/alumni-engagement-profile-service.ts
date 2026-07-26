import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeAlumniEngagement } from "./alumni-engagement";
import {
  type AlumniEngagementProfile,
  createAlumniEngagementProfile,
  refreshAlumniEngagementProfile,
} from "./alumni-engagement-profile";
import type { AlumniActivityView, AlumniEngagement, EventParticipation } from "./alumni-view";
import { computeEventParticipation } from "./participation";
import { engagementProfileRefreshed } from "./alumni-events";
import { AlumniProfileNotFoundError, EventNotFoundError } from "./errors";
import type {
  AlumniEngagementProfileRepository,
  AlumniEventRepository,
  AlumniProfileRepository,
  ChapterMembershipRepository,
  ContributionRepository,
  EventRegistrationRepository,
  MentorshipConnectionRepository,
} from "./ports";

export interface AlumniEngagementProfileServiceDeps {
  readonly profiles: AlumniEngagementProfileRepository;
  readonly alumniProfiles: AlumniProfileRepository;
  readonly registrations: EventRegistrationRepository;
  readonly memberships: ChapterMembershipRepository;
  readonly mentorships: MentorshipConnectionRepository;
  readonly contributions: ContributionRepository;
  readonly alumniEvents: AlumniEventRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * The alumni engagement-profile refresh spine — the composition that rolls the domain's aggregates through the
 * two pure engines. For an alumnus it gathers their attended registrations, active chapter memberships, active
 * mentorships and contributions, values their engagement with `computeAlumniEngagement`, and upserts the
 * derived per-alumnus profile, publishing `alumni.engagement_profile.refreshed`. For an event it values fill
 * and attendance against capacity with `computeEventParticipation` on demand. The engines stay pure — this
 * spine does only the wiring.
 */
export class AlumniEngagementProfileService {
  private readonly profiles: AlumniEngagementProfileRepository;
  private readonly alumniProfiles: AlumniProfileRepository;
  private readonly registrations: EventRegistrationRepository;
  private readonly memberships: ChapterMembershipRepository;
  private readonly mentorships: MentorshipConnectionRepository;
  private readonly contributions: ContributionRepository;
  private readonly alumniEvents: AlumniEventRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AlumniEngagementProfileServiceDeps) {
    this.profiles = deps.profiles;
    this.alumniProfiles = deps.alumniProfiles;
    this.registrations = deps.registrations;
    this.memberships = deps.memberships;
    this.mentorships = deps.mentorships;
    this.contributions = deps.contributions;
    this.alumniEvents = deps.alumniEvents;
    this.events = deps.events;
  }

  /** Recompute and persist the per-alumnus engagement profile from the underlying activity. */
  async refreshForAlumnus(
    tenantId: TenantId,
    alumniProfileId: Uuid,
  ): Promise<AlumniEngagementProfile> {
    const alumnus = await this.alumniProfiles.findById(tenantId, alumniProfileId);
    if (!alumnus) {
      throw new AlumniProfileNotFoundError(alumniProfileId);
    }
    const activity = await this.activityFor(tenantId, alumniProfileId);
    const engagement = computeAlumniEngagement(activity);
    const base =
      (await this.profiles.findByAlumnus(tenantId, alumniProfileId)) ??
      createAlumniEngagementProfile({
        tenantId,
        organizationId: alumnus.organizationId,
        alumniProfileId,
      });
    const refreshed = refreshAlumniEngagementProfile(base, { activity, engagement });
    await this.profiles.save(refreshed);
    await this.emit(engagementProfileRefreshed(refreshed));
    return refreshed;
  }

  /** The live engagement for an alumnus — derived on read, never stored as truth. */
  async engagementForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<AlumniEngagement> {
    if (!(await this.alumniProfiles.findById(tenantId, alumniProfileId))) {
      throw new AlumniProfileNotFoundError(alumniProfileId);
    }
    return computeAlumniEngagement(await this.activityFor(tenantId, alumniProfileId));
  }

  /** The live participation picture for an event — fill and attendance against capacity, derived on read. */
  async eventParticipation(tenantId: TenantId, eventId: Uuid): Promise<EventParticipation> {
    const event = await this.alumniEvents.findById(tenantId, eventId);
    if (!event) {
      throw new EventNotFoundError(eventId);
    }
    const [registeredCount, attendedCount] = await Promise.all([
      this.registrations.countConfirmedByEvent(tenantId, eventId),
      this.registrations.countAttendedByEvent(tenantId, eventId),
    ]);
    return computeEventParticipation(event.capacity, registeredCount, attendedCount);
  }

  /** The stored engagement profile for an alumnus, if one has been refreshed. */
  async getForAlumnus(
    tenantId: TenantId,
    alumniProfileId: Uuid,
  ): Promise<AlumniEngagementProfile | null> {
    return this.profiles.findByAlumnus(tenantId, alumniProfileId);
  }

  private async activityFor(
    tenantId: TenantId,
    alumniProfileId: Uuid,
  ): Promise<AlumniActivityView> {
    const [eventsAttended, activeChapters, activeMentorships, contributionsCount] =
      await Promise.all([
        this.registrations.countAttendedByAlumnus(tenantId, alumniProfileId),
        this.memberships.countActiveByAlumnus(tenantId, alumniProfileId),
        this.mentorships.countActiveByAlumnus(tenantId, alumniProfileId),
        this.contributions.countByAlumnus(tenantId, alumniProfileId),
      ]);
    return { eventsAttended, activeChapters, activeMentorships, contributionsCount };
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
