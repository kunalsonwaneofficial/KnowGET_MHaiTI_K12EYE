import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptySafeguardingEntryError, SafeguardingCaseResolvedError } from "./errors";
import {
  beginInvestigation,
  classifyRisk,
  coordinateExternalAgency,
  escalateSafeguardingCase,
  fileIncidentReport,
  openSafeguardingCase,
  resolveSafeguardingCase,
} from "./safeguarding-case";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;

const openCase = () =>
  openSafeguardingCase({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    concern: " suspected neglect ",
    category: "neglect",
    reportedBy: STAFF,
  });

describe("safeguarding case aggregate", () => {
  it("opens a case with normalized concern, default risk and reported status", () => {
    const k = openCase();
    expect(k.concern).toBe("suspected neglect");
    expect(k.category).toBe("neglect");
    expect(k.riskLevel).toBe("medium");
    expect(k.status).toBe("reported");
    expect(k.resolution).toBeNull();
    expect(() => openSafeguardingCase({ ...openCase(), concern: "  " })).toThrow(
      EmptySafeguardingEntryError,
    );
  });

  it("classifies risk and moves into investigation", () => {
    const classified = classifyRisk(openCase(), "high");
    expect(classified.riskLevel).toBe("high");
    expect(beginInvestigation(classified).status).toBe("under_investigation");
  });

  it("files incident reports and coordinates external agencies as an append-only trail", () => {
    const { kase: k0, report } = fileIncidentReport(openCase(), {
      description: "bruising observed",
      reportedBy: STAFF,
      occurredOn: "2026-04-02",
    });
    expect(report.description).toBe("bruising observed");
    expect(report.occurredOn).toBe("2026-04-02");
    const { kase: k1, involvement } = coordinateExternalAgency(k0, {
      agency: "social services",
      reference: "SS-2026-42",
    });
    expect(k1.incidentReports).toHaveLength(1);
    expect(involvement.agency).toBe("social services");
    expect(k1.externalAgencies).toHaveLength(1);
  });

  it("escalates to a traceable trail and sets the escalated status", () => {
    const { kase, escalation } = escalateSafeguardingCase(openCase(), {
      escalatedTo: "Designated Safeguarding Lead",
      reason: "risk increased",
      escalatedBy: STAFF,
    });
    expect(kase.status).toBe("escalated");
    expect(escalation.escalatedTo).toBe("Designated Safeguarding Lead");
    expect(kase.escalations).toHaveLength(1);
    expect(kase.escalations[0]?.escalatedBy).toBe(STAFF);
  });

  it("resolves with a resolution and refuses further mutation once resolved", () => {
    const resolved = resolveSafeguardingCase(openCase(), " safety plan in place ");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution).toBe("safety plan in place");
    expect(resolved.resolvedAt).not.toBeNull();
    expect(() => beginInvestigation(resolved)).toThrow(SafeguardingCaseResolvedError);
    expect(() =>
      escalateSafeguardingCase(resolved, { escalatedTo: "x", reason: "y", escalatedBy: STAFF }),
    ).toThrow(SafeguardingCaseResolvedError);
    expect(() => resolveSafeguardingCase(resolved, "again")).toThrow(SafeguardingCaseResolvedError);
    expect(() => resolveSafeguardingCase(openCase(), "  ")).toThrow(EmptySafeguardingEntryError);
  });
});
