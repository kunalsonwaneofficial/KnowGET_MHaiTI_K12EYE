import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DASHBOARD_ARCHIVED,
  DASHBOARD_DEFINED,
  DASHBOARD_PANELS_SET,
  DASHBOARD_PUBLISHED,
  DASHBOARD_RENAMED,
} from "./command-events";
import type { DashboardPanel } from "./command-view";
import type { Dashboard, DefineDashboardParams } from "./dashboard";
import { DashboardService } from "./dashboard-service";
import {
  ArchivedDashboardImmutableError,
  DashboardNotFoundError,
  DuplicateDashboardKeyError,
  InvalidDashboardTransitionError,
  OrganizationNotFoundForCommandError,
  UnusablePanelSetError,
} from "./errors";
import {
  type DashboardRepository,
  InMemoryDashboardRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const ABSENT = "org-nowhere" as Uuid;
const MISSING = "dashboard-nowhere" as Uuid;
const KEY = "leadership.overview";

const panel = (overrides: Partial<DashboardPanel> = {}): DashboardPanel => ({
  panelKey: "headline",
  binding: "index_score",
  requiredScope: "command:read",
  kpiKey: null,
  pillar: null,
  ...overrides,
});

const HEADLINE = panel();
const ATTENDANCE = panel({
  panelKey: "attendance",
  binding: "kpi_reading",
  kpiKey: "attendance.rate",
});
const FINANCE = panel({
  panelKey: "finance",
  binding: "pillar_score",
  requiredScope: "command:finance",
  pillar: "financial_health",
});
const QUEUE = panel({
  panelKey: "queue",
  binding: "attention_queue",
  requiredScope: "command:operate",
});

const PANELS: readonly DashboardPanel[] = [HEADLINE, ATTENDANCE, FINANCE, QUEUE];

/** Two faults in one panel: no scope for anybody to hold, and a pillar panel naming no pillar. */
const BROKEN: readonly DashboardPanel[] = [
  panel({ panelKey: "orphan", binding: "pillar_score", requiredScope: "  " }),
];

/** Publishable, and reachable by nobody — the fail-closed reading of an unnamed scope. */
const SCOPELESS: readonly DashboardPanel[] = [
  HEADLINE,
  panel({ panelKey: "half", requiredScope: "" }),
];

const READER: readonly string[] = ["command:read"];

const params = (overrides: Partial<DefineDashboardParams> = {}): DefineDashboardParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  dashboardKey: KEY,
  name: "Leadership overview",
  description: "What the head of school opens on a Monday",
  panels: PANELS,
  ...overrides,
});

class Recorder {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  get types(): string[] {
    return this.published.map((event) => event.type);
  }
}

class StubDirectory implements OrganizationDirectory {
  readonly asked: Uuid[] = [];
  private readonly known: readonly Uuid[];

  constructor(known: readonly Uuid[] = [ORG]) {
    this.known = known;
  }

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    this.asked.push(organizationId);
    return tenantId === TENANT && this.known.includes(organizationId);
  }
}

interface Harness {
  readonly service: DashboardService;
  readonly repository: DashboardRepository;
  readonly organizations: StubDirectory;
  readonly events: Recorder;
}

const harness = (known: readonly Uuid[] = [ORG]): Harness => {
  const repository = new InMemoryDashboardRepository();
  const organizations = new StubDirectory(known);
  const events = new Recorder();
  return {
    service: new DashboardService({ repository, organizations, events }),
    repository,
    organizations,
    events,
  };
};

/** A dashboard in service, and the harness it lives in. */
const live = async (): Promise<Harness & { dashboard: Dashboard }> => {
  const built = harness();
  const draft = await built.service.define(params());
  const dashboard = await built.service.publish(TENANT, draft.id);
  return { ...built, dashboard };
};

describe("declaring a dashboard", () => {
  it("stores the declaration and announces it", async () => {
    const { service, repository, events } = harness();

    const dashboard = await service.define(params());

    expect(dashboard.dashboardKey).toBe(KEY);
    expect(dashboard.status).toBe("draft");
    expect(await repository.findByKey(TENANT, KEY)).toEqual(dashboard);
    expect(events.types).toEqual([DASHBOARD_DEFINED]);
  });

  it("checks the institution exists through the directory port", async () => {
    const { service, organizations } = harness();

    await service.define(params());

    expect(organizations.asked).toEqual([ORG]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    let thrown: unknown;
    try {
      await service.define(params({ organizationId: ABSENT }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForCommandError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a key another dashboard already answers to", async () => {
    const { service, repository, events } = harness();
    await service.define(params());

    let thrown: unknown;
    try {
      await service.define(params({ name: "Overview, again" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateDashboardKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(events.types).toEqual([DASHBOARD_DEFINED]);
  });

  it("compares the normalized key rather than the string the caller typed", async () => {
    const { service } = harness();
    await service.define(params({ dashboardKey: "  Leadership.Overview  " }));

    let thrown: unknown;
    try {
      await service.define(params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateDashboardKeyError);
  });

  it("holds a key an archived dashboard still owns, because a saved link resolves through it", async () => {
    const { service } = harness();
    const dashboard = await service.define(params());
    await service.archive(TENANT, dashboard.id);

    let thrown: unknown;
    try {
      await service.define(params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateDashboardKeyError);
  });

  it("saves a draft whose panels would not survive publication", async () => {
    const { service } = harness();

    const dashboard = await service.define(params({ panels: [] }));

    expect(dashboard.panels).toEqual([]);
    expect(dashboard.status).toBe("draft");
  });

  it("refuses a malformed request before touching the store or the directory", async () => {
    const { service, repository, organizations, events } = harness();

    let thrown: unknown;
    try {
      await service.define(params({ dashboardKey: "   " }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(organizations.asked).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("moving what a dashboard shows", () => {
  it("replaces the panel set wholesale rather than merging into it", async () => {
    const { service, repository, dashboard, events } = await live();

    const next = await service.setPanels(TENANT, dashboard.id, [HEADLINE, QUEUE]);

    expect(next.panels).toEqual([HEADLINE, QUEUE]);
    expect(await repository.findById(TENANT, dashboard.id)).toEqual(next);
    expect(events.types).toEqual([DASHBOARD_DEFINED, DASHBOARD_PUBLISHED, DASHBOARD_PANELS_SET]);
  });

  it("accepts on a draft the very panel set it refuses on a dashboard in service", async () => {
    const drafting = harness();
    const draft = await drafting.service.define(params({ panels: BROKEN }));
    expect(draft.panels).toHaveLength(1);

    const { service, repository, dashboard } = await live();

    let thrown: unknown;
    try {
      await service.setPanels(TENANT, dashboard.id, BROKEN);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusablePanelSetError);
    expect(await repository.findById(TENANT, dashboard.id)).toEqual(dashboard);
  });

  it("renames without moving the key or disturbing what is shown", async () => {
    const { service, dashboard, events } = await live();

    const next = await service.rename(TENANT, dashboard.id, { name: "Head's overview" });

    expect(next.name).toBe("Head's overview");
    expect(next.dashboardKey).toBe(dashboard.dashboardKey);
    expect(next.description).toBe(dashboard.description);
    expect(next.panels).toEqual(dashboard.panels);
    expect(events.types).toEqual([DASHBOARD_DEFINED, DASHBOARD_PUBLISHED, DASHBOARD_RENAMED]);
  });

  it("surfaces the aggregate's refusal to change an archived dashboard, leaving it as it was", async () => {
    const { service, repository, dashboard } = await live();
    const archived = await service.archive(TENANT, dashboard.id);

    let thrown: unknown;
    try {
      await service.setPanels(TENANT, dashboard.id, [HEADLINE]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ArchivedDashboardImmutableError);
    expect(await repository.findById(TENANT, dashboard.id)).toEqual(archived);
  });
});

describe("putting a dashboard into service and taking it out", () => {
  it("publishes it and announces it", async () => {
    const { repository, dashboard, events } = await live();

    expect(dashboard.status).toBe("published");
    expect(dashboard.publishedAt).not.toBeNull();
    expect(await repository.listPublished(TENANT, ORG)).toEqual([dashboard]);
    expect(events.types).toEqual([DASHBOARD_DEFINED, DASHBOARD_PUBLISHED]);
  });

  it("refuses a panel set nobody could read, naming every fault at once", async () => {
    const { service, repository } = harness();
    const draft = await service.define(params({ panels: BROKEN }));

    let thrown: unknown;
    try {
      await service.publish(TENANT, draft.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusablePanelSetError);
    expect((thrown as Error).message).toContain("missing_required_scope");
    expect((thrown as Error).message).toContain("missing_subject");
    expect((await repository.findById(TENANT, draft.id))?.status).toBe("draft");
  });

  it("refuses at publication the empty panel set it let the draft hold", async () => {
    const { service } = harness();
    const draft = await service.define(params({ panels: [] }));

    let thrown: unknown;
    try {
      await service.publish(TENANT, draft.id);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("no_panels");
  });

  it("archives a draft, because a view somebody thought better of is still memory", async () => {
    const { service, repository, events } = harness();
    const draft = await service.define(params());

    const next = await service.archive(TENANT, draft.id);

    expect(next.status).toBe("archived");
    expect(next.archivedAt).not.toBeNull();
    expect(await repository.listPublished(TENANT, ORG)).toEqual([]);
    expect(events.types).toEqual([DASHBOARD_DEFINED, DASHBOARD_ARCHIVED]);
  });

  it("refuses a second archival", async () => {
    const { service, dashboard } = await live();
    await service.archive(TENANT, dashboard.id);

    let thrown: unknown;
    try {
      await service.archive(TENANT, dashboard.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidDashboardTransitionError);
  });

  it("preserves the moment the dashboard was declared across every transition", async () => {
    const { service, repository } = harness();
    const draft = await service.define(params());
    await service.publish(TENANT, draft.id);

    const archived = await service.archive(TENANT, draft.id);

    expect(archived.createdAt).toBe(draft.createdAt);
    expect(await repository.findById(TENANT, draft.id)).toEqual(archived);
  });
});

describe("serving a reader what their scopes reach", () => {
  it("serves the panels the reader reaches, in the order the dashboard declared them", async () => {
    const { service } = await live();

    const served = await service.view(TENANT, KEY, ["command:operate", "command:read"]);

    expect(served).toEqual([HEADLINE, ATTENDANCE, QUEUE]);
  });

  it("removes the rest rather than standing anything in their place", async () => {
    const { service } = await live();

    expect(await service.view(TENANT, KEY, READER)).toEqual([HEADLINE, ATTENDANCE]);
  });

  it("serves an empty page rather than a refusal to a reader who reaches nothing", async () => {
    const { service } = await live();

    expect(await service.view(TENANT, KEY, [])).toEqual([]);
  });

  it("answers a draft as absent rather than as withheld", async () => {
    const { service } = harness();
    await service.define(params());

    let thrown: unknown;
    try {
      await service.view(TENANT, KEY, READER);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardNotFoundError);
    expect((thrown as Error).message).toContain(KEY);
  });

  it("answers an archived dashboard as absent too", async () => {
    const { service, dashboard } = await live();
    await service.archive(TENANT, dashboard.id);

    let thrown: unknown;
    try {
      await service.view(TENANT, KEY, READER);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardNotFoundError);
  });

  it("resolves the key whatever case the saved link kept it in", async () => {
    const { service } = await live();

    expect(await service.view(TENANT, "  LEADERSHIP.OVERVIEW ", READER)).toEqual([
      HEADLINE,
      ATTENDANCE,
    ]);
  });
});

describe("previewing what somebody else would be served", () => {
  it("composes a draft, which is the only way to check a binding before anyone holds it", async () => {
    const { service } = harness();
    const draft = await service.define(params());

    expect(await service.compose(TENANT, draft.id, ["command:finance"])).toEqual([FINANCE]);
  });

  it("omits a panel naming no scope at all, from everybody, however the request is phrased", async () => {
    const { service } = harness();
    const draft = await service.define(params({ panels: SCOPELESS }));

    expect(await service.compose(TENANT, draft.id, READER)).toEqual([HEADLINE]);
    expect(await service.compose(TENANT, draft.id, ["command:read", ""])).toEqual([HEADLINE]);
  });

  it("composes an archived dashboard, so what readers used to be served is still answerable", async () => {
    const { service, dashboard } = await live();
    await service.archive(TENANT, dashboard.id);

    expect(await service.compose(TENANT, dashboard.id, READER)).toEqual([HEADLINE, ATTENDANCE]);
  });

  it("answers a 404 naming the id nobody holds", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.compose(TENANT, MISSING, READER);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });
});

describe("reading dashboards back", () => {
  it("serves one whole, panels and all, whatever any reader would have been shown", async () => {
    const { service, dashboard } = await live();

    expect(await service.get(TENANT, dashboard.id)).toEqual(dashboard);
    expect((await service.get(TENANT, dashboard.id)).panels).toEqual(PANELS);
  });

  it("resolves by key, and the refusal names the normalized form rather than what was typed", async () => {
    const { service, dashboard } = await live();

    expect(await service.getByKey(TENANT, "  LEADERSHIP.OVERVIEW ")).toEqual(dashboard);

    let thrown: unknown;
    try {
      await service.getByKey(TENANT, "  Finance.Board ");
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("finance.board");
  });

  it("does not serve another tenant's dashboard", async () => {
    const { service, dashboard } = await live();

    let thrown: unknown;
    try {
      await service.get(OTHER, dashboard.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardNotFoundError);
  });

  it("lists what an institution's readers may open, and everything it has ever declared", async () => {
    const { service } = await live();
    await service.define(params({ dashboardKey: "finance.board", name: "Finance board pack" }));

    expect(await service.listPublished(TENANT, ORG)).toHaveLength(1);
    expect(await service.list(TENANT)).toHaveLength(2);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const repository = new InMemoryDashboardRepository();
    const service = new DashboardService({
      repository,
      organizations: new StubDirectory(),
    });

    const dashboard = await service.publish(TENANT, (await service.define(params())).id);

    expect(dashboard.status).toBe("published");
    expect(await service.view(TENANT, KEY, READER)).toEqual([HEADLINE, ATTENDANCE]);
  });
});
