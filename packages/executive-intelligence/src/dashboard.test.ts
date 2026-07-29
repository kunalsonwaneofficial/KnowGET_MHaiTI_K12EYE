import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { DASHBOARD_STATUSES, MAX_PANELS_PER_DASHBOARD } from "./command-value";
import type { DashboardPanel } from "./command-view";
import {
  type Dashboard,
  type DefineDashboardParams,
  archiveDashboard,
  composeDashboard,
  dashboardPanel,
  defineDashboard,
  isDashboardPublishable,
  isDashboardPublished,
  publishDashboard,
  renameDashboard,
  setDashboardPanels,
} from "./dashboard";
import {
  ArchivedDashboardImmutableError,
  EmptyDashboardKeyError,
  EmptyDashboardNameError,
  InvalidDashboardTransitionError,
  UnusablePanelSetError,
} from "./errors";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

/** Four panels spanning every subject rule, each naming a scope. What publication accepts. */
const PANELS: readonly DashboardPanel[] = [
  {
    panelKey: "index.score",
    binding: "index_score",
    requiredScope: "command:read",
    kpiKey: null,
    pillar: null,
  },
  {
    panelKey: "pillar.financial",
    binding: "pillar_score",
    requiredScope: "finance:read",
    kpiKey: null,
    pillar: "financial_health",
  },
  {
    panelKey: "kpi.attendance",
    binding: "kpi_reading",
    requiredScope: "command:read",
    kpiKey: "attendance.rate",
    pillar: null,
  },
  {
    panelKey: "queue",
    binding: "attention_queue",
    requiredScope: "command:operate",
    kpiKey: null,
    pillar: null,
  },
];

/** Two faults in one set: a pillar-bound panel naming no pillar, and a panel naming no scope. */
const BROKEN_PANELS: readonly DashboardPanel[] = [
  {
    panelKey: "pillar.nothing",
    binding: "pillar_score",
    requiredScope: "command:read",
    kpiKey: null,
    pillar: null,
  },
  {
    panelKey: "index.open",
    binding: "index_score",
    requiredScope: "   ",
    kpiKey: null,
    pillar: null,
  },
];

const base: DefineDashboardParams = {
  tenantId: TENANT,
  organizationId: ORG,
  dashboardKey: "leadership.overview",
  name: "Leadership overview",
  panels: PANELS,
};

const draft = (patch: Partial<DefineDashboardParams> = {}): Dashboard =>
  defineDashboard({ ...base, ...patch });

const live = (patch: Partial<DefineDashboardParams> = {}): Dashboard =>
  publishDashboard(draft(patch));

const archived = (patch: Partial<DefineDashboardParams> = {}): Dashboard =>
  archiveDashboard(draft(patch));

/** Whether publication would in fact go through, so the read-side predicate can be held against it. */
const publishes = (dashboard: Dashboard): boolean => {
  try {
    publishDashboard(dashboard);
    return true;
  } catch {
    return false;
  }
};

describe("declaring a dashboard", () => {
  it("starts as a draft, which is the state its panels are allowed to be wrong in", () => {
    const dashboard = draft();

    expect(dashboard.status).toBe("draft");
    expect(dashboard.publishedAt).toBeNull();
    expect(dashboard.archivedAt).toBeNull();
  });

  it("takes its tenancy from what it was declared with", () => {
    const dashboard = draft();

    expect(dashboard.tenantId).toBe(TENANT);
    expect(dashboard.organizationId).toBe(ORG);
  });

  it("normalizes the key a saved link resolves through", () => {
    expect(draft({ dashboardKey: "  Leadership.OVERVIEW  " }).dashboardKey).toBe(
      "leadership.overview",
    );
  });

  it("refuses a key nothing could be addressed by", () => {
    let thrown: unknown;
    try {
      draft({ dashboardKey: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyDashboardKeyError);
    expect((thrown as EmptyDashboardKeyError).httpStatus).toBe(422);
  });

  it("refuses a dashboard nobody could find in a sidebar", () => {
    let thrown: unknown;
    try {
      draft({ name: "  " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyDashboardNameError);
    expect((thrown as EmptyDashboardNameError).httpStatus).toBe(422);
  });

  it("keeps a description only when there is one", () => {
    expect(draft().description).toBeNull();
    expect(draft({ description: "  How the trust is doing  " }).description).toBe(
      "How the trust is doing",
    );
    expect(draft({ description: "   " }).description).toBeNull();
  });

  it("saves a panel set publication would refuse, because authoring is iterative", () => {
    const dashboard = draft({ panels: BROKEN_PANELS });

    expect(dashboard.status).toBe("draft");
    expect(dashboard.panels).toHaveLength(2);
  });

  it("saves a dashboard with no panels at all, which is where every dashboard starts", () => {
    expect(draft({ panels: [] }).panels).toEqual([]);
  });

  it("normalizes panel keys on the way in", () => {
    const dashboard = draft({
      panels: [{ ...PANELS[0]!, panelKey: "  Index.SCORE  " }],
    });

    expect(dashboard.panels[0]?.panelKey).toBe("index.score");
  });

  it("detaches the panel set from the array it was handed", () => {
    const mutable: DashboardPanel[] = [...PANELS];
    const dashboard = defineDashboard({ ...base, panels: mutable });

    mutable.length = 0;

    expect(dashboard.panels).toHaveLength(4);
  });

  it("copies a panel field by field, so nothing the caller attached is persisted", () => {
    const smuggled = { ...PANELS[0]!, renderAs: "donut" } as DashboardPanel;
    const dashboard = draft({ panels: [smuggled] });

    expect(dashboard.panels[0]).toEqual({
      panelKey: "index.score",
      binding: "index_score",
      requiredScope: "command:read",
      kpiKey: null,
      pillar: null,
    });
  });
});

describe("authoring a dashboard", () => {
  it("replaces the panel set on a draft without inspecting it", () => {
    const dashboard = setDashboardPanels(draft(), BROKEN_PANELS);

    expect(dashboard.panels.map((panel) => panel.panelKey)).toEqual([
      "pillar.nothing",
      "index.open",
    ]);
  });

  it("inspects the same set on a published dashboard, because that edit is live on save", () => {
    let thrown: unknown;
    try {
      setDashboardPanels(live(), BROKEN_PANELS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusablePanelSetError);
    expect((thrown as UnusablePanelSetError).details).toMatchObject({
      dashboardKey: "leadership.overview",
    });
    expect((thrown as UnusablePanelSetError).httpStatus).toBe(422);
  });

  it("reports every fault at once rather than the next one after each fix", () => {
    let thrown: unknown;
    try {
      setDashboardPanels(live(), BROKEN_PANELS);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as UnusablePanelSetError).details).toEqual({
      dashboardKey: "leadership.overview",
      issues: ["missing_subject", "missing_required_scope"],
    });
  });

  it("accepts a usable replacement on a published dashboard", () => {
    const dashboard = setDashboardPanels(live(), [PANELS[0]!]);

    expect(dashboard.panels).toHaveLength(1);
    expect(dashboard.status).toBe("published");
  });

  it("refuses a set longer than a dashboard may declare", () => {
    const many = Array.from({ length: MAX_PANELS_PER_DASHBOARD + 1 }, (_unused, index) => ({
      ...PANELS[0]!,
      panelKey: `index.score.${String(index)}`,
    }));

    let thrown: unknown;
    try {
      setDashboardPanels(live(), many);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as UnusablePanelSetError).details).toMatchObject({
      issues: ["too_many_panels"],
    });
  });

  it("renames without touching what the dashboard shows", () => {
    const dashboard = renameDashboard(live(), { name: "  Trust overview  " });

    expect(dashboard.name).toBe("Trust overview");
    expect(dashboard.panels).toHaveLength(4);
    expect(dashboard.status).toBe("published");
  });

  it("leaves the description alone when it is not mentioned, and clears it on null", () => {
    const dashboard = draft({ description: "Original" });

    expect(renameDashboard(dashboard, { name: "Renamed" }).description).toBe("Original");
    expect(
      renameDashboard(dashboard, { name: "Renamed", description: null }).description,
    ).toBeNull();
  });

  it("refuses a rename that would leave the dashboard nameless", () => {
    let thrown: unknown;
    try {
      renameDashboard(draft(), { name: "  " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyDashboardNameError);
  });

  it("renames a dashboard whose panels publication would refuse, since a name is not a panel", () => {
    expect(renameDashboard(draft({ panels: BROKEN_PANELS }), { name: "Still wrong" }).name).toBe(
      "Still wrong",
    );
  });

  it("refuses every edit to an archived dashboard", () => {
    const dashboard = archived();
    const attempts = [
      () => setDashboardPanels(dashboard, PANELS),
      () => renameDashboard(dashboard, { name: "Revived" }),
    ];

    for (const attempt of attempts) {
      let thrown: unknown;
      try {
        attempt();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ArchivedDashboardImmutableError);
      expect((thrown as ArchivedDashboardImmutableError).details).toEqual({ id: dashboard.id });
      expect((thrown as ArchivedDashboardImmutableError).httpStatus).toBe(409);
    }
  });

  it("preserves the moment of declaration through an edit", () => {
    const dashboard = draft();

    expect(renameDashboard(dashboard, { name: "Renamed" }).createdAt).toBe(dashboard.createdAt);
  });
});

describe("putting a dashboard into service", () => {
  it("publishes a draft whose panels are usable", () => {
    const dashboard = live();

    expect(dashboard.status).toBe("published");
    expect(dashboard.publishedAt).not.toBeNull();
  });

  it("refuses to publish a panel set a viewer would be served", () => {
    let thrown: unknown;
    try {
      publishDashboard(draft({ panels: BROKEN_PANELS }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusablePanelSetError);
    expect((thrown as UnusablePanelSetError).details).toEqual({
      dashboardKey: "leadership.overview",
      issues: ["missing_subject", "missing_required_scope"],
    });
  });

  it("refuses to publish a dashboard declaring nothing", () => {
    let thrown: unknown;
    try {
      publishDashboard(draft({ panels: [] }));
    } catch (error) {
      thrown = error;
    }

    expect((thrown as UnusablePanelSetError).details).toMatchObject({ issues: ["no_panels"] });
  });

  it("refuses a second publication", () => {
    let thrown: unknown;
    try {
      publishDashboard(live());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidDashboardTransitionError);
    expect((thrown as InvalidDashboardTransitionError).details).toEqual({
      from: "published",
      to: "published",
    });
  });

  it("refuses to publish an archived dashboard rather than reviving it", () => {
    let thrown: unknown;
    try {
      publishDashboard(archived());
    } catch (error) {
      thrown = error;
    }

    expect((thrown as InvalidDashboardTransitionError).details).toEqual({
      from: "archived",
      to: "published",
    });
  });

  it("archives a draft nobody ever put into service", () => {
    const dashboard = archived();

    expect(dashboard.status).toBe("archived");
    expect(dashboard.archivedAt).not.toBeNull();
    expect(dashboard.publishedAt).toBeNull();
  });

  it("archives one that was in service", () => {
    expect(archiveDashboard(live()).status).toBe("archived");
  });

  it("refuses a second archival, because archived is where a dashboard stops", () => {
    let thrown: unknown;
    try {
      archiveDashboard(archived());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidDashboardTransitionError);
    expect((thrown as InvalidDashboardTransitionError).details).toEqual({
      from: "archived",
      to: "archived",
    });
  });

  it("reaches every status the vocabulary declares", () => {
    const reached = [draft(), live(), archived()].map((dashboard) => dashboard.status);

    expect(new Set(reached)).toEqual(new Set(DASHBOARD_STATUSES));
  });
});

describe("reading a dashboard", () => {
  it("says whether it is in service", () => {
    expect(isDashboardPublished(live())).toBe(true);
    expect(isDashboardPublished(draft())).toBe(false);
    expect(isDashboardPublished(archived())).toBe(false);
  });

  it("offers publication exactly when publication would succeed", () => {
    const candidates = [draft(), draft({ panels: BROKEN_PANELS }), draft({ panels: [] }), live()];

    for (const candidate of candidates) {
      expect(isDashboardPublishable(candidate)).toBe(publishes(candidate));
    }
  });

  it("composes down to the panels a viewer's scopes reach", () => {
    const composed = composeDashboard(live(), ["command:read"]);

    expect(composed.map((panel) => panel.panelKey)).toEqual(["index.score", "kpi.attendance"]);
  });

  it("keeps declaration order among the survivors", () => {
    const composed = composeDashboard(live(), ["command:operate", "command:read"]);

    expect(composed.map((panel) => panel.panelKey)).toEqual([
      "index.score",
      "kpi.attendance",
      "queue",
    ]);
  });

  it("says nothing about how much was withheld", () => {
    const composed = composeDashboard(live(), ["command:read"]);

    expect(composed).toHaveLength(2);
    expect(Object.keys(composed)).toEqual(["0", "1"]);
  });

  it("gives a viewer holding nothing an empty dashboard rather than a partial one", () => {
    expect(composeDashboard(live(), [])).toEqual([]);
  });

  it("composes a draft, because only the request can say whether this is a preview", () => {
    expect(composeDashboard(draft(), ["command:read"])).toHaveLength(2);
  });

  it("finds a declared panel by key, whatever case the reference was kept in", () => {
    expect(dashboardPanel(live(), "  KPI.Attendance  ")?.kpiKey).toBe("attendance.rate");
  });

  it("returns nothing for a panel the dashboard does not declare", () => {
    expect(dashboardPanel(live(), "kpi.absence")).toBeNull();
  });

  it("says nothing about visibility, which is what composing first is for", () => {
    const dashboard = live();

    expect(dashboardPanel(dashboard, "pillar.financial")).not.toBeNull();
    expect(composeDashboard(dashboard, ["command:read"])).not.toContainEqual(
      expect.objectContaining({ panelKey: "pillar.financial" }),
    );
  });
});
