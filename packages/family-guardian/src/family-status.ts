/**
 * The lifecycle of a family unit: an `active` household may be `merged` into another
 * household, `split` into new households, or `archived` when it no longer transacts
 * with the institution. `merged`, `split` and `archived` are terminal.
 */
export type FamilyStatus = "active" | "merged" | "split" | "archived";
