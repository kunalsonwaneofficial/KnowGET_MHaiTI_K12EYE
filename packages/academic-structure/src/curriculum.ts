import type { ISODateString } from "@knowget/types";

/**
 * The lifecycle of a curriculum framework: authored as a draft, activated for use,
 * archived when superseded. Revisions bump the version while the framework stays active.
 */
export type CurriculumStatus = "draft" | "active" | "archived";

/**
 * A recorded revision of a curriculum framework — the version it produced, a note on what
 * changed, and when. The revision log is append-only, giving the version-control history
 * the contract requires.
 */
export interface CurriculumRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}
