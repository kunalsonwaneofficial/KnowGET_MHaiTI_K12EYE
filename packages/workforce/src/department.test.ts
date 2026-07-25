import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  archiveDepartment,
  assignDepartmentHead,
  createDepartment,
  isDepartmentActive,
  reactivateDepartment,
  renameDepartment,
  reparentDepartment,
  setCostCenter,
} from "./department";
import {
  EmptyDepartmentCodeError,
  EmptyDepartmentNameError,
  InvalidDepartmentTransitionError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const HEAD = "33333333-3333-3333-3333-333333333333" as Uuid;
const PARENT = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = (code = "MATH", name = "Mathematics") =>
  createDepartment({ tenantId: TENANT, organizationId: ORG, code, name });

describe("createDepartment", () => {
  it("creates an active, top-level department, trimming code/name", () => {
    const dept = createDepartment({
      tenantId: TENANT,
      organizationId: ORG,
      code: "  MATH  ",
      name: "  Mathematics  ",
      costCenter: "  CC-01  ",
    });
    expect(dept.code).toBe("MATH");
    expect(dept.name).toBe("Mathematics");
    expect(dept.costCenter).toBe("CC-01");
    expect(dept.status).toBe("active");
    expect(dept.parentDepartmentId).toBeNull();
    expect(dept.headEmployeeId).toBeNull();
    expect(isDepartmentActive(dept)).toBe(true);
  });

  it("rejects an empty code or name", () => {
    expect(() => make("   ")).toThrow(EmptyDepartmentCodeError);
    expect(() => make("MATH", "  ")).toThrow(EmptyDepartmentNameError);
  });
});

describe("department mutations", () => {
  it("renames, sets cost centre, head and parent", () => {
    let dept = make();
    dept = renameDepartment(dept, "Maths & Stats");
    dept = setCostCenter(dept, "CC-99");
    dept = assignDepartmentHead(dept, HEAD);
    dept = reparentDepartment(dept, PARENT);
    expect(dept.name).toBe("Maths & Stats");
    expect(dept.costCenter).toBe("CC-99");
    expect(dept.headEmployeeId).toBe(HEAD);
    expect(dept.parentDepartmentId).toBe(PARENT);
    expect(setCostCenter(dept, null).costCenter).toBeNull();
    expect(reparentDepartment(dept, null).parentDepartmentId).toBeNull();
  });

  it("rejects an empty rename", () => {
    expect(() => renameDepartment(make(), "  ")).toThrow(EmptyDepartmentNameError);
  });
});

describe("department lifecycle", () => {
  it("archives an active department (clearing the head) and reactivates it", () => {
    const dept = assignDepartmentHead(make(), HEAD);
    const archived = archiveDepartment(dept);
    expect(archived.status).toBe("archived");
    expect(archived.headEmployeeId).toBeNull();
    expect(isDepartmentActive(archived)).toBe(false);
    expect(reactivateDepartment(archived).status).toBe("active");
  });

  it("rejects illegal transitions", () => {
    const dept = make();
    expect(() => reactivateDepartment(dept)).toThrow(InvalidDepartmentTransitionError);
    expect(() => archiveDepartment(archiveDepartment(dept))).toThrow(
      InvalidDepartmentTransitionError,
    );
  });
});
