import { slugify } from "@knowget/shared";

export interface AdminSection {
  readonly label: string;
  readonly href: string;
}

/** Build admin navigation sections with stable, slugified routes. */
export const adminSections = (labels: readonly string[]): AdminSection[] =>
  labels.map((label) => ({ label, href: `/admin/${slugify(label)}` }));
