import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  PersonNotFoundForWellbeingError,
  SafeguardingCaseNotFoundError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import {
  InMemorySafeguardingCaseRepository,
  type PersonDirectory,
  type StudentDirectory,
} from "./ports";
import { SafeguardingCaseService } from "./safeguarding-case-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};
const persons: PersonDirectory = { exists: async (_t, id) => id === STAFF };

function service(): { svc: SafeguardingCaseService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new SafeguardingCaseService({
    repository: new InMemorySafeguardingCaseRepository(),
    students,
    persons,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const open = (svc: SafeguardingCaseService) =>
  svc.open({
    tenantId: TENANT,
    studentId: STUDENT,
    concern: "suspected neglect",
    category: "neglect",
    reportedBy: STAFF,
    riskLevel: "high",
  });

describe("SafeguardingCaseService", () => {
  it("opens a case, deriving the organization and publishing the opened event", async () => {
    const { svc, events } = service();
    const k = await open(svc);
    expect(k.organizationId).toBe(ORG);
    expect(k.riskLevel).toBe("high");
    const openedEvent = events.at(-1);
    expect(openedEvent?.type).toBe("wellbeing.safeguarding_case.opened");
    expect((openedEvent?.payload as { riskLevel: string }).riskLevel).toBe("high");
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown student or reporter", async () => {
    const { svc } = service();
    await expect(
      svc.open({
        tenantId: TENANT,
        studentId: UNKNOWN,
        concern: "x",
        category: "y",
        reportedBy: STAFF,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForWellbeingError);
    await expect(
      svc.open({
        tenantId: TENANT,
        studentId: STUDENT,
        concern: "x",
        category: "y",
        reportedBy: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("drives the investigation-escalation workflow, publishing the escalated event", async () => {
    const { svc, events } = service();
    const k = await open(svc);
    await svc.beginInvestigation(TENANT, k.id);
    await svc.fileIncidentReport(TENANT, k.id, { description: "bruising", reportedBy: STAFF });
    await svc.coordinateExternalAgency(TENANT, k.id, { agency: "social services" });
    const { kase } = await svc.escalate(TENANT, k.id, {
      escalatedTo: "DSL",
      reason: "risk increased",
      escalatedBy: STAFF,
    });
    expect(kase.status).toBe("escalated");
    expect(kase.incidentReports).toHaveLength(1);
    expect(kase.externalAgencies).toHaveLength(1);
    const escalatedEvent = events.at(-1);
    expect(escalatedEvent?.type).toBe("wellbeing.safeguarding_case.escalated");
    expect((escalatedEvent?.payload as { escalatedTo: string }).escalatedTo).toBe("DSL");
  });

  it("validates the reporter on an incident report and reports a missing case", async () => {
    const { svc } = service();
    const k = await open(svc);
    await expect(
      svc.fileIncidentReport(TENANT, k.id, { description: "x", reportedBy: UNKNOWN }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(
      SafeguardingCaseNotFoundError,
    );
  });

  it("resolves a case and allows multiple cases per student", async () => {
    const { svc } = service();
    const k = await open(svc);
    await open(svc);
    const resolved = await svc.resolve(TENANT, k.id, "safety plan agreed");
    expect(resolved.status).toBe("resolved");
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(2);
  });
});
