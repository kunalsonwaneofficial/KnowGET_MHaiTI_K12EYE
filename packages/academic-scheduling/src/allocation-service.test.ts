import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AllocationService } from "./allocation-service";
import {
  AllocationAlreadyReleasedError,
  CapacityExceededError,
  ResourceNotFoundError,
  ResourceRetiredError,
  TeacherNotFoundForSchedulingError,
} from "./errors";
import {
  InMemoryAllocationRepository,
  InMemoryResourceRepository,
  type OrganizationDirectory,
  type TeacherDirectory,
} from "./ports";
import { ResourceService } from "./resource-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const TEACHER = "77777777-7777-7777-7777-777777777777" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const teachers: TeacherDirectory = { exists: async (_t, id) => id === TEACHER };

async function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const resourceRepo = new InMemoryResourceRepository();
  const resources = new ResourceService({ repository: resourceRepo, organizations: orgs });
  const allocations = new AllocationService({
    repository: new InMemoryAllocationRepository(),
    organizations: orgs,
    resources: resourceRepo,
    teachers,
    events: bus,
  });
  const lab = await resources.create({
    tenantId: TENANT,
    organizationId: ORG,
    code: "LAB-1",
    name: "Science Lab",
    kind: "laboratory",
    capacity: 30,
  });
  return { events, resources, allocations, resourceRepo, labId: lab.id };
}

const window = {
  dayOfWeek: "monday" as const,
  startsAt: "09:00",
  endsAt: "10:00",
};

describe("AllocationService", () => {
  it("allocates a resource and publishes resource.allocated", async () => {
    const { events, allocations, labId } = await harness();
    const allocation = await allocations.allocate({
      tenantId: TENANT,
      organizationId: ORG,
      resourceKind: "laboratory",
      resourceId: labId,
      ...window,
      occupancy: 25,
    });
    expect(allocation.status).toBe("allocated");
    expect(events.map((e) => e.type)).toContain("scheduling.resource.allocated");
  });

  it("allocates a teacher via the teacher directory", async () => {
    const { allocations } = await harness();
    const allocation = await allocations.allocate({
      tenantId: TENANT,
      organizationId: ORG,
      resourceKind: "teacher",
      resourceId: TEACHER,
      ...window,
    });
    expect(allocation.resourceKind).toBe("teacher");
    await expect(
      allocations.allocate({
        tenantId: TENANT,
        organizationId: ORG,
        resourceKind: "teacher",
        resourceId: UNKNOWN,
        ...window,
      }),
    ).rejects.toBeInstanceOf(TeacherNotFoundForSchedulingError);
  });

  it("enforces resource capacity and rejects an unknown or retired resource", async () => {
    const { allocations, resources, labId } = await harness();
    await expect(
      allocations.allocate({
        tenantId: TENANT,
        organizationId: ORG,
        resourceKind: "laboratory",
        resourceId: labId,
        ...window,
        occupancy: 40,
      }),
    ).rejects.toBeInstanceOf(CapacityExceededError);
    await expect(
      allocations.allocate({
        tenantId: TENANT,
        organizationId: ORG,
        resourceKind: "classroom",
        resourceId: UNKNOWN,
        ...window,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await resources.retire(TENANT, labId);
    await expect(
      allocations.allocate({
        tenantId: TENANT,
        organizationId: ORG,
        resourceKind: "laboratory",
        resourceId: labId,
        ...window,
      }),
    ).rejects.toBeInstanceOf(ResourceRetiredError);
  });

  it("releases an allocation and rejects a double release", async () => {
    const { events, allocations, labId } = await harness();
    const allocation = await allocations.allocate({
      tenantId: TENANT,
      organizationId: ORG,
      resourceKind: "laboratory",
      resourceId: labId,
      ...window,
    });
    const released = await allocations.release(TENANT, allocation.id);
    expect(released.status).toBe("released");
    expect(released.releasedAt).not.toBeNull();
    expect(events.map((e) => e.type)).toContain("scheduling.resource.released");
    await expect(allocations.release(TENANT, allocation.id)).rejects.toBeInstanceOf(
      AllocationAlreadyReleasedError,
    );
  });
});
