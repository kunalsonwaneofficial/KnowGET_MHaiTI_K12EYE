import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyStudentNumberError, InvalidStudentTransitionError } from "./errors";
import {
  activateStudent,
  assignSection,
  enrollStudent,
  graduateStudent,
  isOnRoll,
  makeAlumni,
  placeOnLeave,
  promoteStudent,
  returnFromLeave,
  setAdministrativeStatus,
  type Student,
  transferStudent,
  withdrawStudent,
} from "./student";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (): Student =>
  enrollStudent({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    studentNumber: "S-2030-001",
    academicYear: "2030",
  });

describe("student", () => {
  it("enrolls a learner in good standing", () => {
    const s = make();
    expect(s.enrollmentStatus).toBe("enrolled");
    expect(s.academicStatus).toBe("good_standing");
    expect(s.administrativeStatus).toBe("clear");
    expect(s.enrolledOn).not.toBeNull();
    expect(isOnRoll(s)).toBe(true);
    expect(() => enrollStudent({ ...make(), studentNumber: "  " })).toThrow(
      EmptyStudentNumberError,
    );
  });

  it("runs the enrolled → active → graduated → alumni path with promotions", () => {
    const active = activateStudent(make());
    expect(active.enrollmentStatus).toBe("active");
    const promoted = promoteStudent(active, { academicYear: "2031" });
    expect(promoted.academicYear).toBe("2031");
    const graduated = graduateStudent(promoted, "2036-05-30");
    expect(graduated.enrollmentStatus).toBe("graduated");
    expect(graduated.exitedOn).toBe("2036-05-30");
    expect(isOnRoll(graduated)).toBe(false);
    expect(makeAlumni(graduated).enrollmentStatus).toBe("alumni");
  });

  it("supports leave, transfer, withdrawal and holds", () => {
    const active = activateStudent(make());
    expect(returnFromLeave(placeOnLeave(active)).enrollmentStatus).toBe("active");
    expect(transferStudent(active).enrollmentStatus).toBe("transferred");
    expect(withdrawStudent(make()).enrollmentStatus).toBe("withdrawn");
    expect(setAdministrativeStatus(active, "hold").administrativeStatus).toBe("hold");
  });

  it("guards illegal transitions", () => {
    expect(() => promoteStudent(make())).toThrow(InvalidStudentTransitionError);
    expect(() => makeAlumni(activateStudent(make()))).toThrow(InvalidStudentTransitionError);
    expect(() => assignSection(withdrawStudent(make()), null)).toThrow(
      InvalidStudentTransitionError,
    );
  });
});
