import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ApplicantService } from "./applicant-service";
import { OrganizationNotFoundForLifecycleError, PersonNotFoundForLifecycleError } from "./errors";
import {
  InMemoryApplicantRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === PERSON || id === STAFF };

function service(): { svc: ApplicantService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new ApplicantService({
    repository: new InMemoryApplicantRepository(),
    persons: personDir,
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const start = () => ({ tenantId: TENANT, organizationId: ORG, personId: PERSON }) as const;

describe("ApplicantService", () => {
  it("starts, submits and approves an application, publishing events", async () => {
    const { svc, events } = service();
    const a = await svc.start({ ...start(), requiredDocuments: ["transcript"] });
    expect(a.status).toBe("draft");

    await svc.submit(TENANT, a.id);
    await svc.beginReview(TENANT, a.id);
    const approved = await svc.approve(TENANT, a.id, { decidedById: STAFF });
    expect(approved.status).toBe("approved");
    expect(events.map((e) => e.type)).toEqual([
      "student.application.submitted",
      "student.applicant.approved",
    ]);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown organization, person, or decider", async () => {
    const { svc } = service();
    await expect(svc.start({ ...start(), organizationId: STAFF })).rejects.toBeInstanceOf(
      OrganizationNotFoundForLifecycleError,
    );
    await expect(svc.start({ ...start(), personId: ORG })).rejects.toBeInstanceOf(
      PersonNotFoundForLifecycleError,
    );
    const a = await svc.start(start());
    await svc.submit(TENANT, a.id);
    await expect(svc.approve(TENANT, a.id, { decidedById: ORG })).rejects.toBeInstanceOf(
      PersonNotFoundForLifecycleError,
    );
  });
});
