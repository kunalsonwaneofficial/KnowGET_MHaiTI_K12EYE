import { slugify } from "@knowget/shared";

/** The platform's headline tagline. */
export const getPlatformTagline = (): string =>
  "One intelligent platform for the whole institution";

/** Build a stable section id from a human title (via shared slugify). */
export const toSectionId = (title: string): string => slugify(title);
