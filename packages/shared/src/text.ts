/** True when a string is empty or whitespace-only. */
export const isBlank = (value: string): boolean => value.trim().length === 0;

/** Convert arbitrary text into a URL/identifier-safe slug. */
export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Truncate a string to `max` characters, appending an ellipsis when cut. */
export const truncate = (value: string, max: number): string => {
  if (max <= 0) {
    return "";
  }
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
};
