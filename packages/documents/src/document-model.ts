export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Block =
  | { readonly kind: "heading"; readonly level: HeadingLevel; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | {
      readonly kind: "table";
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

/** A renderer-agnostic structured document. */
export interface DocumentModel {
  readonly title?: string;
  readonly blocks: readonly Block[];
}

/** A renderer turns a {@link DocumentModel} into a concrete serialized format. */
export interface DocumentRenderer {
  readonly contentType: string;
  render(document: DocumentModel): string;
}

/** Fluent builder for assembling a {@link DocumentModel}. */
export class DocumentBuilder {
  private titleText: string | undefined;
  private readonly blocks: Block[] = [];

  title(text: string): this {
    this.titleText = text;
    return this;
  }

  heading(level: HeadingLevel, text: string): this {
    this.blocks.push({ kind: "heading", level, text });
    return this;
  }

  paragraph(text: string): this {
    this.blocks.push({ kind: "paragraph", text });
    return this;
  }

  list(items: readonly string[], ordered = false): this {
    this.blocks.push({ kind: "list", ordered, items });
    return this;
  }

  table(headers: readonly string[], rows: readonly (readonly string[])[]): this {
    this.blocks.push({ kind: "table", headers, rows });
    return this;
  }

  build(): DocumentModel {
    return {
      ...(this.titleText !== undefined ? { title: this.titleText } : {}),
      blocks: this.blocks,
    };
  }
}
