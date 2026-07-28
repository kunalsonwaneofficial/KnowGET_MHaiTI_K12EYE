import { describe, expect, it } from "vitest";
import {
  MAX_PANELS_PER_DASHBOARD,
  PANEL_BINDINGS,
  PANEL_VISIBILITY_OUTCOMES,
  type HealthPillar,
  type PanelBinding,
} from "./command-value";
import type { DashboardPanel, PanelSubject } from "./command-view";
import {
  PANEL_ISSUE_CODES,
  PANEL_SUBJECTS,
  type PanelIssueCode,
  composeFor,
  validatePanels,
} from "./composition";

const panel = (
  panelKey: string,
  binding: PanelBinding = "index_score",
  requiredScope = "command:read",
  kpiKey: string | null = null,
  pillar: HealthPillar | null = null,
): DashboardPanel => ({ panelKey, binding, requiredScope, kpiKey, pillar });

const kpiPanel = (panelKey: string, requiredScope = "command:read"): DashboardPanel =>
  panel(panelKey, "kpi_reading", requiredScope, "attendance.rate", null);

const pillarPanel = (panelKey: string, requiredScope = "command:read"): DashboardPanel =>
  panel(panelKey, "pillar_score", requiredScope, null, "financial_health");

const codesOf = (panels: readonly DashboardPanel[]): readonly string[] =>
  validatePanels(panels).issues.map((entry) => entry.code);

const keysOf = (panels: readonly DashboardPanel[]): readonly string[] =>
  panels.map((entry) => entry.panelKey);

describe("PANEL_SUBJECTS", () => {
  it("says what every binding is about, so a new one cannot compose an empty tile", () => {
    for (const binding of PANEL_BINDINGS) {
      expect(PANEL_SUBJECTS[binding]).toBeDefined();
    }
    expect(Object.keys(PANEL_SUBJECTS)).toHaveLength(PANEL_BINDINGS.length);
  });

  it("names only subjects a panel can carry", () => {
    const subjects = new Set<PanelSubject>(["kpi", "pillar", "none"]);
    for (const binding of PANEL_BINDINGS) {
      expect(subjects.has(PANEL_SUBJECTS[binding])).toBe(true);
    }
  });

  it("binds both KPI-shaped panels to a KPI and the pillar panel to a pillar", () => {
    expect(PANEL_SUBJECTS.kpi_reading).toBe("kpi");
    expect(PANEL_SUBJECTS.kpi_series).toBe("kpi");
    expect(PANEL_SUBJECTS.pillar_score).toBe("pillar");
  });

  it("leaves the institution-wide panels without a subject", () => {
    expect(PANEL_SUBJECTS.index_score).toBe("none");
    expect(PANEL_SUBJECTS.index_series).toBe("none");
    expect(PANEL_SUBJECTS.attention_queue).toBe("none");
    expect(PANEL_SUBJECTS.coverage_report).toBe("none");
  });
});

describe("validatePanels", () => {
  it("accepts a dashboard whose panels each name a key, a scope and their subject", () => {
    expect(
      validatePanels([panel("overview"), kpiPanel("attendance"), pillarPanel("finance")]),
    ).toEqual({ usable: true, issues: [] });
  });

  it("declares every issue code it can emit, without repetition", () => {
    expect(new Set(PANEL_ISSUE_CODES).size).toBe(PANEL_ISSUE_CODES.length);
  });

  it("refuses a dashboard with no panels at all and says nothing else about it", () => {
    expect(validatePanels([])).toEqual({
      usable: false,
      issues: [{ code: "no_panels", panelIndex: null }],
    });
  });

  it("names the panel a fault was found at", () => {
    const verdict = validatePanels([panel("overview"), panel("   ")]);
    expect(verdict.issues).toContainEqual({ code: "missing_panel_key", panelIndex: 1 });
  });

  it("reports a fault about the dashboard rather than about any one panel", () => {
    const many = Array.from({ length: MAX_PANELS_PER_DASHBOARD + 1 }, (_, index) =>
      panel(`p-${String(index)}`),
    );
    expect(validatePanels(many).issues).toContainEqual({
      code: "too_many_panels",
      panelIndex: null,
    });
  });

  it("accepts a dashboard that sits exactly on the ceiling", () => {
    const full = Array.from({ length: MAX_PANELS_PER_DASHBOARD }, (_, index) =>
      panel(`p-${String(index)}`),
    );
    expect(validatePanels(full).usable).toBe(true);
  });

  it("refuses a panel that cannot be addressed", () => {
    expect(codesOf([panel("")])).toContain("missing_panel_key");
    expect(codesOf([panel("  \t ")])).toContain("missing_panel_key");
  });

  it("refuses two panels a viewer could not tell apart", () => {
    expect(validatePanels([panel("Overview"), panel(" overview ")]).issues).toContainEqual({
      code: "duplicate_panel_key",
      panelIndex: 1,
    });
  });

  it("does not report an unaddressable panel as a duplicate of the next one", () => {
    const codes = codesOf([panel("  "), panel("")]);
    expect(codes).not.toContain("duplicate_panel_key");
    expect(codes.filter((code) => code === "missing_panel_key")).toHaveLength(2);
  });

  it("refuses a panel that names no scope, rather than reading it as unrestricted", () => {
    expect(codesOf([panel("overview", "index_score", "")])).toContain("missing_required_scope");
    expect(codesOf([panel("overview", "index_score", "   ")])).toContain("missing_required_scope");
  });

  it("refuses a KPI panel that does not say which KPI", () => {
    expect(codesOf([panel("k", "kpi_reading")])).toContain("missing_subject");
    expect(codesOf([panel("k", "kpi_series", "command:read", "  ")])).toContain("missing_subject");
  });

  it("refuses a pillar panel that does not say which pillar", () => {
    expect(codesOf([panel("p", "pillar_score")])).toContain("missing_subject");
  });

  it("refuses a subject the binding does not take", () => {
    expect(codesOf([panel("i", "index_score", "command:read", "attendance.rate")])).toContain(
      "unexpected_subject",
    );
    expect(
      codesOf([panel("c", "coverage_report", "command:read", null, "financial_health")]),
    ).toContain("unexpected_subject");
  });

  it("refuses a panel that names the other binding's subject", () => {
    expect(
      codesOf([panel("k", "kpi_reading", "command:read", "attendance.rate", "financial_health")]),
    ).toContain("unexpected_subject");
    expect(
      codesOf([panel("p", "pillar_score", "command:read", "attendance.rate", "financial_health")]),
    ).toContain("unexpected_subject");
  });

  it("reports a panel that names neither its own subject nor stops at it", () => {
    const codes = codesOf([panel("k", "kpi_reading", "command:read", null, "financial_health")]);
    expect(codes).toContain("missing_subject");
    expect(codes).toContain("unexpected_subject");
  });

  it("reports several faults at once rather than one at a time", () => {
    const codes = codesOf([panel("  ", "kpi_reading", "  ")]);
    expect(codes).toContain("missing_panel_key");
    expect(codes).toContain("missing_required_scope");
    expect(codes).toContain("missing_subject");
  });

  it("emits only codes it declared", () => {
    const declared = new Set<string>(PANEL_ISSUE_CODES);
    const broken: readonly (readonly DashboardPanel[])[] = [
      [],
      [panel("  ")],
      [panel("a"), panel("a")],
      [panel("a", "index_score", "")],
      [panel("a", "kpi_reading")],
      [panel("a", "coverage_report", "command:read", "attendance.rate", "financial_health")],
      Array.from({ length: MAX_PANELS_PER_DASHBOARD + 1 }, () => panel("same")),
    ];
    for (const set of broken) {
      for (const entry of validatePanels(set).issues) {
        expect(declared.has(entry.code as PanelIssueCode)).toBe(true);
      }
    }
  });
});

describe("composeFor", () => {
  it("keeps the panels whose scope the viewer holds, in declaration order", () => {
    const panels = [
      panel("a", "index_score", "command:read"),
      panel("b", "index_score", "command:brief"),
      panel("c", "index_score", "command:read"),
    ];
    expect(keysOf(composeFor(panels, ["command:read"]))).toEqual(["a", "c"]);
  });

  it("removes what the viewer cannot reach rather than blanking it in place", () => {
    const panels = [
      panel("public", "index_score", "command:read"),
      pillarPanel("payroll", "hr:read"),
    ];
    const composed = composeFor(panels, ["command:read"]);
    expect(composed).toHaveLength(1);
    expect(composed[0]).toBe(panels[0]);
  });

  it("leaves no trace of what was withheld", () => {
    const withheld = [
      panel("shown", "index_score", "command:read"),
      panel("hidden", "index_score", "safeguarding:read"),
    ];
    const never = [panel("shown", "index_score", "command:read")];
    expect(composeFor(withheld, ["command:read"])).toEqual(composeFor(never, ["command:read"]));
  });

  it("matches a scope by exact string once both sides are normalized", () => {
    const panels = [panel("a", "index_score", "  Command:Read ")];
    expect(composeFor(panels, [" COMMAND:read "])).toHaveLength(1);
    expect(composeFor(panels, ["command:reader"])).toHaveLength(0);
    expect(composeFor(panels, ["command"])).toHaveLength(0);
  });

  it("omits a panel that declares no scope, for everybody", () => {
    const panels = [panel("half_built", "index_score", "   ")];
    expect(composeFor(panels, ["command:read", "command:manage"])).toEqual([]);
    expect(composeFor(panels, [""])).toEqual([]);
    expect(composeFor(panels, ["   "])).toEqual([]);
  });

  it("shows a viewer holding nothing nothing at all", () => {
    expect(composeFor([panel("a"), panel("b")], [])).toEqual([]);
  });

  it("composes what is reachable even when the panel set would not validate", () => {
    const panels = [
      panel("a", "index_score", "command:read"),
      panel("a", "kpi_reading", "command:read"),
    ];
    expect(validatePanels(panels).usable).toBe(false);
    expect(composeFor(panels, ["command:read"])).toHaveLength(2);
  });

  it("does not truncate an over-long dashboard at the ceiling", () => {
    const many = Array.from({ length: MAX_PANELS_PER_DASHBOARD + 5 }, (_, index) =>
      panel(`p-${String(index)}`, "index_score", "command:read"),
    );
    expect(composeFor(many, ["command:read"])).toHaveLength(many.length);
  });

  it("leaves the declared panels alone", () => {
    const panels = [
      panel("a", "index_score", "command:read"),
      panel("b", "index_score", "hr:read"),
    ];
    const composed = composeFor(panels, ["command:read"]);
    expect(panels).toHaveLength(2);
    expect(composed).not.toBe(panels);
  });

  it("holds one opinion about who sees what, and it is removal", () => {
    expect(PANEL_VISIBILITY_OUTCOMES).toEqual(["omitted"]);
  });
});
