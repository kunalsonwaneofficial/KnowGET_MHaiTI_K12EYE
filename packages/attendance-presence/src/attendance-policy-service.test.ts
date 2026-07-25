import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AttendancePolicyService } from "./attendance-policy-service";
import {
  AttendancePolicyArchivedError,
  DuplicateAttendancePolicyError,
  OrganizationNotFoundForAttendanceError,
} from "./errors";
import { InMemoryAttendancePolicyRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

const service = () =>
  new AttendancePolicyService({
    repository: new InMemoryAttendancePolicyRepository(),
    organizations: orgs,
  });

const create = (svc: AttendancePolicyService, code = "MIN-75") =>
  svc.create({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: "Minimum attendance 75%",
    ruleType: "minimum_attendance_percentage",
    parameters: { minimumPercentage: 75 },
  });

describe("AttendancePolicyService", () => {
  it("creates a draft policy at version 1", async () => {
    const svc = service();
    const p = await create(svc);
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
    expect(p.parameters).toEqual({ minimumPercentage: 75 });
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const svc = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        code: "X",
        name: "X",
        ruleType: "grace_period",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAttendanceError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateAttendancePolicyError);
  });

  it("activates, version-controls via revisions, and only lists active for evaluation", async () => {
    const repo = new InMemoryAttendancePolicyRepository();
    const svc = new AttendancePolicyService({ repository: repo, organizations: orgs });
    const p = await create(svc);
    expect((await svc.activate(TENANT, p.id)).status).toBe("active");
    const revised = await svc.revise(TENANT, p.id, "raise threshold to 80");
    expect(revised.version).toBe(2);
    expect(revised.revisions).toHaveLength(1);
    expect(await repo.listActiveForEvaluation(TENANT, ORG)).toHaveLength(1);
  });

  it("blocks mutation once archived", async () => {
    const svc = service();
    const p = await create(svc);
    await svc.archive(TENANT, p.id);
    await expect(svc.rename(TENANT, p.id, "New")).rejects.toBeInstanceOf(
      AttendancePolicyArchivedError,
    );
  });
});
