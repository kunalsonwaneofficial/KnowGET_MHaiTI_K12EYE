import type { Uuid } from "@knowget/types";

/** The role a person plays within a household. */
export type HouseholdRole = "head" | "parent" | "guardian" | "child" | "dependent" | "other";

/**
 * A member of a household — always a {@link Person} (`personId`), never duplicated
 * identity — together with the role they play in it. The household's single primary
 * point of contact is tracked on the {@link Family} itself, not per member.
 */
export interface HouseholdMember {
  readonly personId: Uuid;
  readonly role: HouseholdRole;
}
