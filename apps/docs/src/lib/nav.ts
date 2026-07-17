import { slugify } from "@knowget/shared";

export interface DocLink {
  readonly title: string;
  readonly id: string;
}

/** Build documentation nav links with slugified anchors. */
export const docLinks = (titles: readonly string[]): DocLink[] =>
  titles.map((title) => ({ title, id: slugify(title) }));
