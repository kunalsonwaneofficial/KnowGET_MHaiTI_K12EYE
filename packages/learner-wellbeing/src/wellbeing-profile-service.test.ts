import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateWellbeingProfileError,
  StudentNotFoundForWellbeingError,
  WellbeingProfileNotFoundError,
} from "./errors";
import { InMemoryWellbeingProfileRepository, type StudentDirectory } from "./ports";
import { WellbeingProfileService } from "./wellbeing-profile-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

const service = () =>
  new WellbeingProfileService({
    repository: new InMemoryWellbeingProfileRepository(),
    students,
  });

describe("WellbeingProfileService", () => {
  it("creates a profile, deriving the organization from the student", async () => {
    const svc = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    expect(p.organizationId).toBe(ORG);
    expect(await svc.getById(TENANT, p.id)).toEqual(p);
    expect(await svc.getByStudent(TENANT, STUDENT)).toEqual(p);
    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown student", async () => {
    await expect(service().create({ tenantId: TENANT, studentId: UNKNOWN })).rejects.toBeInstanceOf(
      StudentNotFoundForWellbeingError,
    );
  });

  it("rejects a second profile for the same student", async () => {
    const svc = service();
    await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await expect(svc.create({ tenantId: TENANT, studentId: STUDENT })).rejects.toBeInstanceOf(
      DuplicateWellbeingProfileError,
    );
  });

  it("drives the dimension, indicator, support and metric surfaces", async () => {
    const svc = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await svc.setDimension(TENANT, p.id, "emotional", "at_risk");
    await svc.updateDimensions(TENANT, p.id, { physical: "stable" });
    await svc.setLearningSupportIndicators(TENANT, p.id, ["dyslexia"]);
    await svc.putSuccessMetric(TENANT, p.id, "attendance", 0.9);
    const withMetric = await svc.putSuccessMetric(TENANT, p.id, "attendance", 0.95);
    expect(withMetric.successMetrics).toEqual([{ name: "attendance", value: 0.95 }]);
    const updated = await svc.updateIndicators(TENANT, p.id, { wellbeingTrend: "improving" });
    expect(updated.dimensions.emotional).toBe("at_risk");
    expect(updated.dimensions.physical).toBe("stable");
    expect(updated.learningSupportIndicators).toEqual(["dyslexia"]);
    expect(updated.indicators.wellbeingTrend).toBe("improving");
    const cleared = await svc.removeSuccessMetric(TENANT, p.id, "attendance");
    expect(cleared.successMetrics).toEqual([]);
  });

  it("isolates tenants and reports a missing profile", async () => {
    const svc = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const otherTenant = "44444444-4444-4444-4444-444444444444" as TenantId;
    await expect(svc.getById(otherTenant, p.id)).rejects.toBeInstanceOf(
      WellbeingProfileNotFoundError,
    );
    expect(await svc.getByStudent(otherTenant, STUDENT)).toBeNull();
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(
      WellbeingProfileNotFoundError,
    );
  });
});
