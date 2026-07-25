import { PD_CATEGORIES, type PdCategory } from "./faculty-value";
import type {
  DevelopmentActivityView,
  DevelopmentLedger,
  DevelopmentLedgerLine,
  DevelopmentRequirementView,
} from "./faculty-view";

/**
 * The pure professional-development ledger engine — reconciles a staff member's PD **requirements**
 * (required hours per category) against their PD **activities** into a per-category ledger (required,
 * completed, remaining) plus totals and a compliance rate. Only **completed** activities earn hours;
 * planned/enrolled/cancelled activities do not count. The compliance rate credits completion only
 * **up to each category's requirement**, so a surplus in one category never masks a deficit in
 * another. Pure and deterministic; every total is division-safe, non-negative and (for the rate)
 * two-decimal and clamped to 0–100. A category with no requirement is vacuously compliant (100%).
 * This is the genuine computational core of CPD compliance — built and tested before any aggregate
 * depends on it.
 */
export function computeDevelopmentLedger(
  requirements: readonly DevelopmentRequirementView[],
  activities: readonly DevelopmentActivityView[],
): DevelopmentLedger {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const hours = (value: number): number => Math.max(0, value);

  const requiredByCategory = new Map<PdCategory, number>();
  for (const r of requirements) {
    requiredByCategory.set(
      r.category,
      (requiredByCategory.get(r.category) ?? 0) + hours(r.requiredHours),
    );
  }

  const present = new Set<PdCategory>([...requiredByCategory.keys()]);
  for (const a of activities) {
    present.add(a.category);
  }

  const lines: DevelopmentLedgerLine[] = [];
  for (const category of PD_CATEGORIES) {
    if (!present.has(category)) {
      continue;
    }
    const required = round(requiredByCategory.get(category) ?? 0);
    const completed = round(
      activities
        .filter((a) => a.category === category && a.status === "completed")
        .reduce((sum, a) => sum + hours(a.hours), 0),
    );
    lines.push({
      category,
      required,
      completed,
      remaining: round(Math.max(0, required - completed)),
      compliancePct: required > 0 ? round(Math.min(100, (100 * completed) / required)) : 100,
    });
  }

  const totalRequired = round(lines.reduce((sum, l) => sum + l.required, 0));
  const totalCompleted = round(lines.reduce((sum, l) => sum + l.completed, 0));
  const totalRemaining = round(lines.reduce((sum, l) => sum + l.remaining, 0));
  // Compliance credits completion only up to each category's requirement (no cross-category offset).
  const creditedTowardRequirement = lines.reduce(
    (sum, l) => sum + Math.min(l.completed, l.required),
    0,
  );
  const complianceRate =
    totalRequired > 0
      ? round(Math.min(100, (100 * creditedTowardRequirement) / totalRequired))
      : 100;

  return { lines, totalRequired, totalCompleted, totalRemaining, complianceRate };
}
