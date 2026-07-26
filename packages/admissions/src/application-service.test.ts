import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ApplicationService } from "./application-service";
import { createAdmissionCycle, openCycle } from "./admission-cycle";
import type { PersonDirectory } from "./ports";
import { InMemoryAdmissionCycleRepository, InMemoryApplicationRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === applicantPersonId;
  },
};

const setup = async (open = true) => {
  const repository = new InMemoryApplicationRepository();
  const cycles = new InMemoryAdmissionCycleRepository();
  const events: DomainEvent[] = [];
  let cycle = createAdmissionCycle({
    tenantId,
    organizationId,
    code: "CYC-27",
    name: "Intake",
    academicYear: "2027-28",
    gradeCapacities: [{ grade: "G1", capacity: 40 }],
  });
  if (open) {
    cycle = openCycle(cycle);
  }
  await cycles.save(cycle);
  const service = new ApplicationService({
    repository,
    cycles,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, cycles, service, cycle, events };
};

const submitInput = (cycleId: Uuid) => ({
  tenantId,
  cycleId,
  applicantPersonId,
  code: "APP-1",
  gradeApplyingFor: "G1",
  submittedOn: "2026-11-01",
});

describe("ApplicationService", () => {
  it("submits to an open cycle (deriving org) and drives the review workflow", async () => {
    const { service, cycle, events } = await setup();
    const a = await service.submit(submitInput(cycle.id));
    expect(a.organizationId).toBe(organizationId);
    await service.startReview(tenantId, a.id);
    await service.scheduleInterview(tenantId, a.id);
    await service.offer(tenantId, a.id, "2026-12-01");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("admissions.application.submitted")).toBe(true);
    expect(types.has("admissions.application.offered")).toBe(true);
  });

  it("rejects a closed cycle, an unknown applicant, and a duplicate code", async () => {
    const { service: closed, cycle: cc } = await setup(false);
    await expect(closed.submit(submitInput(cc.id))).rejects.toThrow(/not open/);

    const { service, cycle } = await setup();
    await expect(
      service.submit({ ...submitInput(cycle.id), applicantPersonId: "ghost" as Uuid }),
    ).rejects.toThrow(/Person/);
    await service.submit(submitInput(cycle.id));
    await expect(service.submit(submitInput(cycle.id))).rejects.toThrow(/already in use/);
  });
});
