import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isChapterJoinable } from "./alumni-chapter";
import {
  type ChapterMembership,
  isMembershipActive,
  joinChapterMembership,
  leaveChapterMembership,
  reactivateMembership,
  setMembershipRole,
} from "./chapter-membership";
import type { MembershipRole } from "./alumni-value";
import {
  membershipJoined,
  membershipLeft,
  membershipReactivated,
  membershipRoleSet,
} from "./alumni-events";
import {
  AlumniProfileNotFoundError,
  ChapterNotFoundError,
  ChapterNotJoinableError,
  DuplicateChapterMembershipError,
  MembershipNotFoundError,
} from "./errors";
import type {
  AlumniChapterRepository,
  AlumniProfileRepository,
  ChapterMembershipRepository,
} from "./ports";

export interface JoinChapterInput {
  readonly tenantId: TenantId;
  readonly chapterId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly joinedOn: string;
  readonly role?: MembershipRole;
}

export interface ChapterMembershipServiceDeps {
  readonly repository: ChapterMembershipRepository;
  readonly chapters: AlumniChapterRepository;
  readonly profiles: AlumniProfileRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for chapter memberships. Joins an alumnus to a joinable chapter (validating the chapter
 * and the alumni profile, deriving the organization from the chapter), maintaining **one membership row per
 * (chapter, alumnus)** — a returning alumnus who had left is reactivated rather than duplicated — and drives
 * role changes and leaving, publishing the membership events.
 */
export class ChapterMembershipService {
  private readonly repository: ChapterMembershipRepository;
  private readonly chapters: AlumniChapterRepository;
  private readonly profiles: AlumniProfileRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ChapterMembershipServiceDeps) {
    this.repository = deps.repository;
    this.chapters = deps.chapters;
    this.profiles = deps.profiles;
    this.events = deps.events;
  }

  async join(input: JoinChapterInput): Promise<ChapterMembership> {
    const chapter = await this.chapters.findById(input.tenantId, input.chapterId);
    if (!chapter) {
      throw new ChapterNotFoundError(input.chapterId);
    }
    if (!isChapterJoinable(chapter)) {
      throw new ChapterNotJoinableError(input.chapterId);
    }
    if (!(await this.profiles.findById(input.tenantId, input.alumniProfileId))) {
      throw new AlumniProfileNotFoundError(input.alumniProfileId);
    }
    const existing = await this.repository.findByChapterAndAlumnus(
      input.tenantId,
      input.chapterId,
      input.alumniProfileId,
    );
    if (existing) {
      if (isMembershipActive(existing)) {
        throw new DuplicateChapterMembershipError(input.chapterId, input.alumniProfileId);
      }
      const reactivated = reactivateMembership(existing, input.joinedOn);
      await this.repository.save(reactivated);
      await this.emit(membershipReactivated(reactivated));
      return reactivated;
    }
    const membership = joinChapterMembership({
      tenantId: input.tenantId,
      organizationId: chapter.organizationId,
      chapterId: input.chapterId,
      alumniProfileId: input.alumniProfileId,
      joinedOn: input.joinedOn,
      role: input.role,
    });
    await this.repository.save(membership);
    await this.emit(membershipJoined(membership));
    return membership;
  }

  async setRole(tenantId: TenantId, id: Uuid, role: MembershipRole): Promise<ChapterMembership> {
    const updated = setMembershipRole(await this.require(tenantId, id), role);
    await this.repository.save(updated);
    await this.emit(membershipRoleSet(updated));
    return updated;
  }

  async leave(tenantId: TenantId, id: Uuid, leftOn: string): Promise<ChapterMembership> {
    const updated = leaveChapterMembership(await this.require(tenantId, id), leftOn);
    await this.repository.save(updated);
    await this.emit(membershipLeft(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<ChapterMembership> {
    return this.require(tenantId, id);
  }

  async listForChapter(tenantId: TenantId, chapterId: Uuid): Promise<ChapterMembership[]> {
    return this.repository.listByChapter(tenantId, chapterId);
  }

  async listForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<ChapterMembership[]> {
    return this.repository.listByAlumnus(tenantId, alumniProfileId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ChapterMembership> {
    const membership = await this.repository.findById(tenantId, id);
    if (!membership) {
      throw new MembershipNotFoundError(id);
    }
    return membership;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
