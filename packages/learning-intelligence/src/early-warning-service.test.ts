import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EARLY_WARNING_RAISED, EARLY_WARNING_RESOLVED } from "./learning-intelligence-events";
import { EarlyWarningService } from "./early-warning-service";
import { EarlyWarningStateError, StudentNotFoundForInsightError } from "./errors";
import {
  InMemoryEarlyWarningRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("EarlyWarningService", () => {
  let repository: InMemoryEarlyWarningRepository;
  let events: DomainEvent[];
  let service: EarlyWarningService;

  beforeEach(() => {
    repository = new InMemoryEarlyWarningRepository();
    events = [];
    service = new EarlyWarningService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const raise = () =>
    service.raise({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      dimension: "attendance",
      ruleId: "attendance-at-risk",
      severity: "at_risk",
      observedScore: 40,
      rationale: "Attendance health 40 (< 50) — sustained absence.",
    });

  it("validates the student and raises an explainable warning with history", async () => {
    await expect(
      service.raise({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: "ghost" as Uuid,
        dimension: "attendance",
        ruleId: "r",
        severity: "at_risk",
        observedScore: 40,
        rationale: "x",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForInsightError);

    const warning = await raise();
    expect(warning.status).toBe("raised");
    expect(warning.ruleId).toBe("attendance-at-risk");
    expect(warning.history.map((h) => h.action)).toEqual(["raised"]);
    expect(events.map((e) => e.type)).toEqual([EARLY_WARNING_RAISED]);
  });

  it("does not raise a duplicate open warning for the same rule", async () => {
    const first = await raise();
    const second = await raise();
    expect(second.id).toBe(first.id);
    // only one raise event
    expect(events.filter((e) => e.type === EARLY_WARNING_RAISED)).toHaveLength(1);
  });

  it("drives acknowledge → resolve and emits on resolve", async () => {
    const warning = await raise();
    await service.acknowledge(TENANT, warning.id, null, "counsellor notified");
    const resolved = await service.resolve(TENANT, warning.id, null, "attendance recovered");
    expect(resolved.status).toBe("resolved");
    expect(resolved.history.map((h) => h.action)).toEqual(["raised", "acknowledged", "resolved"]);
    expect(events.map((e) => e.type)).toEqual([EARLY_WARNING_RAISED, EARLY_WARNING_RESOLVED]);

    // a fresh raise now creates a new warning (previous one is closed)
    const reraised = await raise();
    expect(reraised.id).not.toBe(warning.id);
  });

  it("cannot resolve an already-resolved warning", async () => {
    const warning = await raise();
    await service.resolve(TENANT, warning.id);
    await expect(service.resolve(TENANT, warning.id)).rejects.toBeInstanceOf(
      EarlyWarningStateError,
    );
  });
});
