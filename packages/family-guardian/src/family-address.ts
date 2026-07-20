/**
 * A postal address for a household. A family may hold several (home, secondary,
 * correspondence); at most one is marked primary. Identified within the family by its
 * `label`.
 */
export interface FamilyAddress {
  readonly label: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string;
  readonly isPrimary: boolean;
}
