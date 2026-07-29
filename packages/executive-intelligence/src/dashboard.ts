import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type DashboardStatus, normalizeDashboardKey, normalizePanelKey } from "./command-value";
import type { DashboardPanel } from "./command-view";
import { composeFor, validatePanels } from "./composition";
import {
  ArchivedDashboardImmutableError,
  EmptyDashboardKeyError,
  EmptyDashboardNameError,
  InvalidDashboardTransitionError,
  UnusablePanelSetError,
} from "./errors";

/**
 * A dashboard: which panels an institution has declared, and which scope each of them requires.
 *
 * The contract's first clause is role-aware dashboards. The whole of the *aware* part is one string comparison in
 * the composition engine; what lives here is the declaration it compares against — the panels, their bindings,
 * their subjects, and the scope each one needs. Nothing here says how any of it is drawn, and the type has no
 * field where that could be written down.
 *
 * **Nothing pins a dashboard, and that changes the entire mutability argument.** A KPI's scale freezes at
 * activation and an index's weights freeze at publication because readings and assessments carry the numbers those
 * produced; editing either in place would leave a record elsewhere unexplainable. A dashboard produces no such
 * record. No figure is ever computed from it and nothing anywhere quotes it — it is a view, and views are supposed
 * to be edited. So this aggregate lets its panel set be rewritten, including while the dashboard is live, and the
 * absence of a freeze here is a deliberate asymmetry rather than an oversight.
 *
 * What stands in place of the freeze is a different rule: **the panel set is inspected exactly when it would
 * become visible.** A draft's panels are never checked, because declaring a forty-panel dashboard is iterative
 * work and a platform that refused to save a half-finished panel would push the authoring into a spreadsheet.
 * Publication checks. And an edit to an already-published dashboard checks too, because that edit is live the
 * moment it saves — there is no draft standing between the author and the reader to catch it. The same set of
 * panels is therefore refused on a published dashboard and accepted on a draft, which looks inconsistent until
 * you ask who is about to see the result.
 *
 * `archived` is terminal, and this is the one aggregate in the package where terminality is not about protecting
 * a backward reference. It is about people. A dashboard restored after two terms out of service would reappear in
 * the sidebars of everyone who had it, bound to KPIs that may have been retired since, in a layout nobody has
 * looked at against the current catalog. Declaring the successor is genuinely cheap here precisely because nothing
 * pins a dashboard — a new dashboard carrying the same panels is an equivalent object in a way that a new index
 * definition never is — and it puts the panel set back in front of an author before it goes back in front of
 * readers.
 *
 * The aggregate holds no data. A dashboard is a declaration of what to fetch, never a cache of what was fetched;
 * the moment a panel carried a value, two dashboards showing the same KPI would be able to disagree about it.
 */

// --- The aggregate ---------------------------------------------------------------

export interface Dashboard {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /**
   * How the dashboard is addressed. Normalized on the way in and never edited afterwards, because it is what a
   * viewer's saved link and an institution's default-dashboard setting both resolve through.
   */
  readonly dashboardKey: string;
  readonly name: string;
  readonly description: string | null;
  /**
   * The declared panels, in the order they will be composed. Order is the only positioning this package has, and
   * it is deliberate: a coordinate would leave visible holes where a viewer's withheld panels used to be.
   */
  readonly panels: readonly DashboardPanel[];
  readonly status: DashboardStatus;
  readonly publishedAt: ISODateString | null;
  readonly archivedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineDashboardParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly dashboardKey: string;
  readonly name: string;
  readonly description?: string | null;
  readonly panels: readonly DashboardPanel[];
}

/** What may be changed about a dashboard's description of itself. */
export interface RenameDashboardParams {
  readonly name: string;
  /** Omit to leave the existing description alone; pass `null` to clear it. */
  readonly description?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * A defensive copy of a declared panel set, field by field.
 *
 * Explicit rather than a spread so that adding a field to {@link DashboardPanel} fails to compile here until
 * somebody has decided whether it belongs in the stored declaration. A spread would carry whatever the caller
 * happened to attach, and a panel silently holding an extra property is how a rendering hint ends up persisted in
 * the one package that has spent its whole module comment refusing to have an opinion about rendering.
 */
const copyPanels = (panels: readonly DashboardPanel[]): readonly DashboardPanel[] =>
  panels.map((panel) => ({
    panelKey: normalizePanelKey(panel.panelKey),
    binding: panel.binding,
    requiredScope: panel.requiredScope,
    kpiKey: panel.kpiKey,
    pillar: panel.pillar,
  }));

/**
 * Declare a dashboard. Starts as a draft, which is the state its panels can still be wrong in.
 *
 * The panel set is deliberately not validated here. A dashboard is assembled a panel at a time and the intermediate
 * states are all invalid — one panel with no scope yet, one bound to a KPI whose key is still being decided — so
 * refusing to save them would mean the composition of every dashboard on the platform was worked out somewhere
 * this contract cannot see. Publication is the gate, and it reports every fault at once.
 */
export function defineDashboard(params: DefineDashboardParams): Dashboard {
  const dashboardKey = normalizeDashboardKey(params.dashboardKey);
  if (dashboardKey.length === 0) throw new EmptyDashboardKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyDashboardNameError();

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    dashboardKey,
    name,
    description: trimmedOrNull(params.description),
    panels: copyPanels(params.panels),
    status: "draft",
    publishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (dashboard: Dashboard, patch: Partial<Dashboard>): Dashboard => ({
  ...dashboard,
  ...patch,
  updatedAt: nowIso(),
});

/** An archived dashboard is out of service and does not move. Every edit below starts here. */
function requireLive(dashboard: Dashboard): void {
  if (dashboard.status === "archived") {
    throw new ArchivedDashboardImmutableError(dashboard.id);
  }
}

// --- Authoring -------------------------------------------------------------------

/**
 * Replace the declared panels.
 *
 * Checked when the dashboard is published and not when it is a draft, which is the visibility rule the module
 * comment argues for. The check on a live dashboard is not defensive tidiness: a published dashboard's panels are
 * what viewers are served on their next request, so an edit that broke one would surface as that panel quietly
 * vanishing from some people's screens and not others', depending on whose scopes happened to reach it.
 *
 * Panels are replaced wholesale rather than added and removed one at a time, because their order is their layout.
 * An interface that inserted a panel would need to say where, and this package has deliberately refused to have
 * anywhere for that to be said.
 */
export function setDashboardPanels(
  dashboard: Dashboard,
  panels: readonly DashboardPanel[],
): Dashboard {
  requireLive(dashboard);
  if (dashboard.status === "published") {
    requireUsablePanels(dashboard.dashboardKey, panels);
  }
  return touch(dashboard, { panels: copyPanels(panels) });
}

/** Change what the dashboard is called. Never touches what it shows, so no panel check applies. */
export function renameDashboard(dashboard: Dashboard, params: RenameDashboardParams): Dashboard {
  requireLive(dashboard);
  const name = params.name.trim();
  if (name.length === 0) throw new EmptyDashboardNameError();
  return touch(dashboard, {
    name,
    description:
      params.description === undefined ? dashboard.description : trimmedOrNull(params.description),
  });
}

/** The one place a panel set is refused, so publication and a live edit cannot drift into two standards. */
function requireUsablePanels(dashboardKey: string, panels: readonly DashboardPanel[]): void {
  const verdict = validatePanels(panels);
  if (!verdict.usable) {
    throw new UnusablePanelSetError(
      dashboardKey,
      verdict.issues.map((entry) => entry.code),
    );
  }
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Put the dashboard into service.
 *
 * The panel check happens here rather than at composition, and the composition engine's refusal to re-run it is
 * the other half of the same decision: a dashboard with one malformed panel still serves the rest of itself to
 * every viewer, instead of the whole thing going dark for everybody the moment somebody saved a bad edit.
 */
export function publishDashboard(dashboard: Dashboard): Dashboard {
  if (dashboard.status !== "draft") {
    throw new InvalidDashboardTransitionError(dashboard.status, "published");
  }
  requireUsablePanels(dashboard.dashboardKey, dashboard.panels);
  return touch(dashboard, { status: "published", publishedAt: nowIso() });
}

/**
 * Take the dashboard out of service.
 *
 * Reachable from a draft as well as from service, because a dashboard somebody thought better of before it ever
 * went live is archived rather than deleted — what an institution decided it wanted to look at, and then decided
 * it did not, is worth as much to a later reader as the dashboards that survived.
 */
export function archiveDashboard(dashboard: Dashboard): Dashboard {
  if (dashboard.status === "archived") {
    throw new InvalidDashboardTransitionError(dashboard.status, "archived");
  }
  return touch(dashboard, { status: "archived", archivedAt: nowIso() });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the dashboard is in service. */
export const isDashboardPublished = (dashboard: Dashboard): boolean =>
  dashboard.status === "published";

/**
 * Whether publication would succeed — the read-side of exactly the guards {@link publishDashboard} applies, so an
 * authoring screen can say why the action is unavailable rather than offering it and failing.
 */
export const isDashboardPublishable = (dashboard: Dashboard): boolean =>
  dashboard.status === "draft" && validatePanels(dashboard.panels).usable;

/**
 * The panels a viewer holding these scopes may see, in declaration order.
 *
 * The only door from this aggregate into the composition engine, and it composes whatever the dashboard's status
 * is. That is not an oversight. An author previewing their own draft is a legitimate composition and the two
 * cases — an author looking at their draft, a reader looking at a published dashboard — are distinguishable only
 * by who is asking, which is a fact about the request and not about the record. Deciding it here would mean this
 * aggregate had guessed, and the guess that costs something is the one that stops an author from ever seeing what
 * they are building.
 *
 * There is nothing on the result saying how much was withheld, because {@link composeFor} returns the panels
 * themselves rather than a report about them. A viewer cannot tell from a composed dashboard whether anything was
 * removed, which is the only version of role-awareness that does not leak.
 */
export const composeDashboard = (
  dashboard: Dashboard,
  grantedScopes: readonly string[],
): readonly DashboardPanel[] => composeFor(dashboard.panels, grantedScopes);

/**
 * One declared panel by key, or `null`.
 *
 * Addressing a panel by key is the reason panel keys have to be unique within a dashboard, and this is where that
 * uniqueness is spent. The key is normalized on both sides, so a viewer's saved reference resolves whatever case
 * it was stored in — a lookup that missed on a stray capital would return `null` and read, to everything
 * downstream, exactly like a panel the viewer may not see.
 *
 * Says nothing about visibility. A caller serving a single panel composes first and looks up in the result.
 */
export const dashboardPanel = (dashboard: Dashboard, panelKey: string): DashboardPanel | null => {
  const wanted = normalizePanelKey(panelKey);
  return dashboard.panels.find((panel) => normalizePanelKey(panel.panelKey) === wanted) ?? null;
};
