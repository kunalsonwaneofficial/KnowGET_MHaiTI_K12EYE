import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateSchedulingPolicyError,
  OrganizationNotFoundForSchedulingError,
  SchedulingPolicyArchivedError,
} from "./errors";
import { InMemorySchedulingPolicyRepository, type OrganizationDirectory } from "./ports";
import { SchedulingPolicyService } from "./scheduling-policy-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

const service = () =>
  new SchedulingPolicyService({
    repository: new InMemorySchedulingPolicyRepository(),
    organizations: orgs,
  });

const create = (svc: SchedulingPolicyService, code = "MAX-PERIODS") =>
  svc.create({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: "Max teaching periods",
    ruleType: "max_teaching_periods",
    parameters: { maxPeriodsPerDay: 6 },
  });

describe("SchedulingPolicyService", () => {
  it("creates a draft policy at version 1", async () => {
    const svc = service();
    const p = await create(svc);
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
    expect(p.parameters).toEqual({ maxPeriodsPerDay: 6 });
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const svc = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        code: "X",
        name: "X",
        ruleType: "break_rule",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForSchedulingError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateSchedulingPolicyError);
  });

  it("activates and version-controls the policy via revisions", async () => {
    const svc = service();
    const p = await create(svc);
    expect((await svc.activate(TENANT, p.id)).status).toBe("active");
    const revised = await svc.revise(TENANT, p.id, "raise the daily cap to 7");
    expect(revised.version).toBe(2);
    expect(revised.revisions).toHaveLength(1);
    expect(revised.status).toBe("active");
  });

  it("blocks mutation once archived", async () => {
    const svc = service();
    const p = await create(svc);
    await svc.archive(TENANT, p.id);
    await expect(svc.rename(TENANT, p.id, "New")).rejects.toBeInstanceOf(
      SchedulingPolicyArchivedError,
    );
  });
});
