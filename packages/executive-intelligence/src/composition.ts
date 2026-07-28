import {
  MAX_PANELS_PER_DASHBOARD,
  type PanelBinding,
  normalizeKpiKey,
  normalizePanelKey,
  normalizeScope,
  scopeGrants,
} from "./command-value";
import type { DashboardPanel, PanelIssue, PanelSetVerdict, PanelSubject } from "./command-view";

/**
 * The composition engine: what a particular person is shown, and what they are not shown they are not shown.
 *
 * The contract's first clause is role-aware dashboards, and the whole of role-awareness in this package is one
 * string comparison: a panel names the scope it requires, a viewer arrives with the scopes they hold, and
 * composition keeps what matches. There is no role table here, no seniority, no notion of "executive" as a type.
 * Anything richer would be an access model running in parallel to the one that actually gates the requests, and
 * the day the two disagreed the disagreement would surface as a leak rather than as a failed test.
 *
 * A panel the viewer's scopes do not reach is **removed**. Not blanked, not greyed, not replaced with a tile
 * saying restricted, not left as a gap in a layout. This is why {@link DashboardPanel} has no position field: a
 * composed dashboard that carried coordinates would show holes where the withheld panels used to be, and a hole
 * is a disclosure — it tells a bursar that a safeguarding panel exists, roughly how much of it there is, and
 * that somebody decided they should not see it. The panel visibility vocabulary has exactly one member for this
 * reason, and the day a `redacted` mode is proposed the proposal has to be made against that paragraph.
 *
 * The engine fails closed twice over. A panel that declares no scope at all is omitted for everybody rather than
 * shown to everybody, because the reading of an empty requirement as "unrestricted" turns a half-finished panel
 * definition into a public one. And composition never consults {@link validatePanels} — an invalid panel set
 * composes to whatever of it is reachable, so a dashboard with one malformed panel still serves the rest instead
 * of going dark for every viewer at once.
 */

// --- Bindings and subjects -------------------------------------------------------

/**
 * What each binding needs naming.
 *
 * Declared as a total map rather than as a switch so that adding a member to {@link PanelBinding} fails to
 * compile here until somebody has said what it is about. A new binding that silently defaulted to needing no
 * subject would compose into an empty tile, which is the one outcome this engine exists to prevent.
 */
export const PANEL_SUBJECTS: Readonly<Record<PanelBinding, PanelSubject>> = Object.freeze({
  kpi_reading: "kpi",
  kpi_series: "kpi",
  pillar_score: "pillar",
  index_score: "none",
  index_series: "none",
  attention_queue: "none",
  coverage_report: "none",
});

// --- Validation ------------------------------------------------------------------

/** Stable codes for what can be wrong with a dashboard's declared panels. Reported all at once. */
export const PANEL_ISSUE_CODES = [
  "no_panels",
  "too_many_panels",
  "missing_panel_key",
  "duplicate_panel_key",
  "missing_required_scope",
  "missing_subject",
  "unexpected_subject",
] as const;
export type PanelIssueCode = (typeof PANEL_ISSUE_CODES)[number];

const issue = (code: PanelIssueCode, panelIndex: number | null): PanelIssue => ({
  code,
  panelIndex,
});

/**
 * Whether a panel names the subject its binding takes, and nothing it does not take.
 *
 * A subject supplied where the binding takes none is an issue rather than a harmless extra, for the same reason
 * an attestor on a domain record is. A `coverage_report` panel carrying a pillar reads, to anybody looking at the
 * definition, as a coverage report about that pillar — and it is not one. The field would be ignored at
 * composition and the author would never find out that the dashboard they thought they built does not exist.
 */
const subjectIssues = (panel: DashboardPanel, index: number): readonly PanelIssue[] => {
  const wanted = PANEL_SUBJECTS[panel.binding];
  const hasKpi = panel.kpiKey !== null && normalizeKpiKey(panel.kpiKey).length > 0;
  const hasPillar = panel.pillar !== null;

  const found: PanelIssue[] = [];
  if ((wanted === "kpi" && !hasKpi) || (wanted === "pillar" && !hasPillar)) {
    found.push(issue("missing_subject", index));
  }
  if (
    (wanted === "kpi" && hasPillar) ||
    (wanted === "pillar" && hasKpi) ||
    (wanted === "none" && (hasKpi || hasPillar))
  ) {
    found.push(issue("unexpected_subject", index));
  }
  return found;
};

/**
 * Inspect a dashboard's declared panels and report everything wrong with them.
 *
 * Run when a dashboard is authored, not when it is composed. A definition is checked where its author can see
 * the result; re-litigating it on every viewer's request would mean an edit that broke a dashboard showed up as
 * that dashboard quietly getting smaller for everyone rather than as a refused save.
 *
 * The {@link MAX_PANELS_PER_DASHBOARD} ceiling is enforced here and nowhere else, because it is a property of the
 * definition rather than of any viewing of it. Composition must not truncate: a viewer who happens to reach the
 * forty-first panel of an over-long dashboard has a legitimate claim on it, and silently dropping it would make
 * the visible dashboard depend on where in the list somebody's scopes happened to land.
 */
export const validatePanels = (panels: readonly DashboardPanel[]): PanelSetVerdict => {
  if (panels.length === 0) {
    return { usable: false, issues: [issue("no_panels", null)] };
  }

  const issues: PanelIssue[] = [];
  if (panels.length > MAX_PANELS_PER_DASHBOARD) {
    issues.push(issue("too_many_panels", null));
  }

  const seen = new Set<string>();
  panels.forEach((panel, index) => {
    const key = normalizePanelKey(panel.panelKey);
    if (key.length === 0) {
      issues.push(issue("missing_panel_key", index));
    } else if (seen.has(key)) {
      issues.push(issue("duplicate_panel_key", index));
    } else {
      seen.add(key);
    }

    if (normalizeScope(panel.requiredScope).length === 0) {
      issues.push(issue("missing_required_scope", index));
    }

    issues.push(...subjectIssues(panel, index));
  });

  return { usable: issues.length === 0, issues };
};

// --- Composition -----------------------------------------------------------------

/**
 * The panels a viewer holding these scopes may see, in declaration order.
 *
 * Returns the panels themselves rather than a report about them, and that is the API expressing the rule: there
 * is no field on the result where a count of what was withheld could be read, so no caller can accidentally
 * render one. A viewer of a dashboard composed for them cannot tell from the result whether anything was removed,
 * which is the only version of role-awareness that does not leak.
 *
 * Order among the survivors is the order the definition declared them. Stable across viewers, so two people
 * comparing screens see the panels they share in the same sequence — and stable across a re-composition, so a
 * dashboard does not rearrange itself when somebody's scopes change.
 */
export const composeFor = (
  panels: readonly DashboardPanel[],
  grantedScopes: readonly string[],
): readonly DashboardPanel[] =>
  panels.filter((panel) => {
    const required = normalizeScope(panel.requiredScope);
    return required.length > 0 && scopeGrants(grantedScopes, required);
  });
