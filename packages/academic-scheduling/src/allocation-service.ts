import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { resourceAllocated, resourceReleased } from "./academic-scheduling-events";
import {
  type Allocation,
  type AllocationKind,
  createAllocation,
  releaseAllocation,
} from "./allocation";
import {
  AllocationNotFoundError,
  CapacityExceededError,
  OrganizationNotFoundForSchedulingError,
  ResourceNotFoundError,
  ResourceRetiredError,
  ScheduleSlotNotFoundError,
  SectionNotFoundForSchedulingError,
  TeacherNotFoundForSchedulingError,
} from "./errors";
import type {
  AllocationRepository,
  OrganizationDirectory,
  ResourceRepository,
  ScheduleSlotRepository,
  SectionDirectory,
  TeacherDirectory,
} from "./ports";

export interface AllocationServiceDeps {
  readonly repository: AllocationRepository;
  readonly organizations: OrganizationDirectory;
  readonly resources: ResourceRepository;
  readonly teachers: TeacherDirectory;
  readonly slots?: ScheduleSlotRepository;
  readonly sections?: SectionDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface AllocateInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly resourceKind: AllocationKind;
  readonly resourceId: Uuid;
  readonly dayOfWeek: Allocation["dayOfWeek"];
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleSlotId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly occupancy?: number | null;
}

/**
 * Application service for allocations. Assigns a resource (a teacher, classroom, laboratory
 * or piece of equipment) to a recurring window against a validated Organization, validating
 * the target by kind (teacher via the teacher directory; otherwise a live, non-retired
 * Resource) and enforcing resource capacity. Publishes {@link resourceAllocated} on
 * assignment and {@link resourceReleased} on release. Overlap conflicts between allocations
 * are detected by the conflict engine at timetable-publication time.
 */
export class AllocationService {
  private readonly repository: AllocationRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly resources: ResourceRepository;
  private readonly teachers: TeacherDirectory;
  private readonly slots: ScheduleSlotRepository | undefined;
  private readonly sections: SectionDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AllocationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.resources = deps.resources;
    this.teachers = deps.teachers;
    this.slots = deps.slots;
    this.sections = deps.sections;
    this.events = deps.events;
  }

  async allocate(input: AllocateInput): Promise<Allocation> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSchedulingError(input.organizationId);
    }
    await this.assertTarget(input);
    if (input.scheduleSlotId && this.slots) {
      if (!(await this.slots.findById(input.tenantId, input.scheduleSlotId))) {
        throw new ScheduleSlotNotFoundError(input.scheduleSlotId);
      }
    }
    if (
      input.sectionId &&
      this.sections &&
      !(await this.sections.exists(input.tenantId, input.sectionId))
    ) {
      throw new SectionNotFoundForSchedulingError(input.sectionId);
    }
    const allocation = createAllocation(input);
    await this.repository.save(allocation);
    await this.emit(resourceAllocated(allocation));
    return allocation;
  }

  async release(tenantId: TenantId, id: Uuid): Promise<Allocation> {
    const released = releaseAllocation(await this.require(tenantId, id));
    await this.repository.save(released);
    await this.emit(resourceReleased(released));
    return released;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Allocation> {
    return this.require(tenantId, id);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForResource(tenantId: TenantId, resourceId: Uuid): Promise<Allocation[]> {
    return this.repository.listByResource(tenantId, resourceId);
  }

  async listForSlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Allocation[]> {
    return this.repository.listBySlot(tenantId, scheduleSlotId);
  }

  /**
   * Validate the allocation target. Teacher allocations must reference a real teacher; every
   * other kind must reference a live (non-retired) resource, and a requested occupancy may
   * not exceed the resource's capacity.
   */
  private async assertTarget(input: AllocateInput): Promise<void> {
    if (input.resourceKind === "teacher") {
      if (!(await this.teachers.exists(input.tenantId, input.resourceId))) {
        throw new TeacherNotFoundForSchedulingError(input.resourceId);
      }
      return;
    }
    const resource = await this.resources.findById(input.tenantId, input.resourceId);
    if (!resource) {
      throw new ResourceNotFoundError(input.resourceId);
    }
    if (resource.status === "retired") {
      throw new ResourceRetiredError(resource.id);
    }
    if (
      input.occupancy !== null &&
      input.occupancy !== undefined &&
      resource.capacity !== null &&
      input.occupancy > resource.capacity
    ) {
      throw new CapacityExceededError(resource.id, resource.capacity, input.occupancy);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Allocation> {
    const allocation = await this.repository.findById(tenantId, id);
    if (!allocation) {
      throw new AllocationNotFoundError(id);
    }
    return allocation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
