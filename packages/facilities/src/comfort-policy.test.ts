import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateComfortPolicy,
  archiveComfortPolicy,
  draftComfortPolicy,
  isComfortPolicyActive,
  renameComfortPolicy,
  setComfortThresholds,
} from "./comfort-policy";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  draftComfortPolicy({
    tenantId,
    organizationId,
    name: "Classroom comfort",
    thresholds: [{ metric: "temperature", min: 18, max: 26 }],
  });

describe("ComfortPolicy aggregate", () => {
  it("drafts with a trimmed name, default version 1, and validated thresholds", () => {
    const p = draftComfortPolicy({
      tenantId,
      organizationId,
      name: "  Classroom comfort ",
      thresholds: [
        { metric: "temperature", min: 18, max: 26 },
        { metric: "co2", min: 0, max: 1000 },
      ],
    });
    expect(p.name).toBe("Classroom comfort");
    expect(p.version).toBe(1);
    expect(p.status).toBe("draft");
    expect(p.thresholds).toHaveLength(2);
  });

  it("rejects an empty name, a bad version, and malformed thresholds", () => {
    expect(() => draftComfortPolicy({ tenantId, organizationId, name: " " })).toThrow(/name/);
    expect(() => draftComfortPolicy({ tenantId, organizationId, name: "x", version: 0 })).toThrow(
      /positive integer/,
    );
    expect(() =>
      draftComfortPolicy({
        tenantId,
        organizationId,
        name: "x",
        thresholds: [{ metric: "weather", min: 1, max: 2 }],
      }),
    ).toThrow(/unknown metric/);
    expect(() =>
      draftComfortPolicy({
        tenantId,
        organizationId,
        name: "x",
        thresholds: [{ metric: "temperature", min: 30, max: 10 }],
      }),
    ).toThrow(/exceeds max/);
    expect(() =>
      draftComfortPolicy({
        tenantId,
        organizationId,
        name: "x",
        thresholds: [
          { metric: "temperature", min: 18, max: 26 },
          { metric: "temperature", min: 19, max: 25 },
        ],
      }),
    ).toThrow(/duplicate metric/);
  });

  it("edits thresholds and name only while draft", () => {
    const p = make();
    expect(
      setComfortThresholds(p, [{ metric: "humidity", min: 30, max: 60 }]).thresholds,
    ).toHaveLength(1);
    expect(renameComfortPolicy(p, "New name").name).toBe("New name");
    const active = activateComfortPolicy(p);
    expect(() => setComfortThresholds(active, [])).toThrow(/cannot move/); // frozen once active
    expect(() => renameComfortPolicy(active, "x")).toThrow(/cannot move/);
  });

  it("runs draft → active → archived and guards illegal moves", () => {
    const p = make();
    const active = activateComfortPolicy(p);
    expect(isComfortPolicyActive(active)).toBe(true);
    expect(() => activateComfortPolicy(active)).toThrow(/cannot move/); // already active
    const archived = archiveComfortPolicy(active);
    expect(archived.status).toBe("archived");
    expect(() => archiveComfortPolicy(archived)).toThrow(/cannot move/); // terminal
    expect(() => activateComfortPolicy(archived)).toThrow(/cannot move/);
  });
});
