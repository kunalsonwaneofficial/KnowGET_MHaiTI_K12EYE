import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  ComponentNotFoundError,
  DuplicateComponentKeyError,
  EmptyFeeStructureCodeError,
  FeeStructureNotEditableError,
  InvalidCurrencyError,
  InvalidFeeStructureTransitionError,
} from "./errors";
import {
  activateFeeStructure,
  addFeeComponent,
  archiveFeeStructure,
  createFeeStructure,
  feeStructureTotal,
  isFeeStructureActive,
  removeFeeComponent,
  renameFeeStructure,
  updateFeeComponentAmount,
} from "./fee-structure";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  code: "STD-2025",
  name: "Standard 2025",
  currency: "INR",
  academicYear: "2025-26",
  components: [
    { key: "tuition", name: "Tuition", amountMinor: 500000 },
    { key: "transport", name: "Transport", amountMinor: 120000 },
  ],
} as const;

const create = () => createFeeStructure(base);

describe("fee structure", () => {
  it("creates in draft with a valid currency and totals its components", () => {
    const fs = create();
    expect(fs.status).toBe("draft");
    expect(fs.version).toBe(1);
    expect(fs.components).toHaveLength(2);
    expect(feeStructureTotal(fs)).toEqual({ amountMinor: 620000, currency: "INR" });
    expect(() => createFeeStructure({ ...base, currency: "rupee" })).toThrow(InvalidCurrencyError);
    expect(() => createFeeStructure({ ...base, code: " " })).toThrow(EmptyFeeStructureCodeError);
  });

  it("rejects duplicate component keys at creation", () => {
    expect(() =>
      createFeeStructure({
        ...base,
        components: [
          { key: "dup", name: "A", amountMinor: 1 },
          { key: "dup", name: "B", amountMinor: 2 },
        ],
      }),
    ).toThrow(DuplicateComponentKeyError);
  });

  it("edits components only while draft, bumping the version and total", () => {
    let fs = addFeeComponent(create(), { key: "lab", name: "Lab", amountMinor: 30000 });
    expect(fs.version).toBe(2);
    expect(feeStructureTotal(fs).amountMinor).toBe(650000);
    fs = updateFeeComponentAmount(fs, "lab", 40000);
    expect(fs.version).toBe(3);
    expect(feeStructureTotal(fs).amountMinor).toBe(660000);
    fs = removeFeeComponent(fs, "transport");
    expect(fs.components.map((c) => c.key)).toEqual(["tuition", "lab"]);
    expect(() => addFeeComponent(fs, { key: "tuition", name: "Dup", amountMinor: 1 })).toThrow(
      DuplicateComponentKeyError,
    );
    expect(() => removeFeeComponent(fs, "missing")).toThrow(ComponentNotFoundError);
    expect(() => updateFeeComponentAmount(fs, "missing", 1)).toThrow(ComponentNotFoundError);
  });

  it("freezes components once active and runs draft → active → archived", () => {
    const fs = activateFeeStructure(create());
    expect(fs.status).toBe("active");
    expect(isFeeStructureActive(fs)).toBe(true);
    expect(() => addFeeComponent(fs, { key: "x", name: "X", amountMinor: 1 })).toThrow(
      FeeStructureNotEditableError,
    );
    expect(() => updateFeeComponentAmount(fs, "tuition", 1)).toThrow(FeeStructureNotEditableError);
    const archived = archiveFeeStructure(fs);
    expect(archived.status).toBe("archived");
    expect(() => activateFeeStructure(archived)).toThrow(InvalidFeeStructureTransitionError);
  });

  it("renames", () => {
    expect(renameFeeStructure(create(), "New Name").name).toBe("New Name");
  });
});
