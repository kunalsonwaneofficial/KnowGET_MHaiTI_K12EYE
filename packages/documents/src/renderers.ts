import type { Block, DocumentModel, DocumentRenderer } from "./document-model";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Renders a document to semantic, escaped HTML. */
export class HtmlRenderer implements DocumentRenderer {
  readonly contentType = "text/html";

  render(document: DocumentModel): string {
    const parts: string[] = [];
    if (document.title !== undefined) {
      parts.push(`<h1>${escapeHtml(document.title)}</h1>`);
    }
    for (const block of document.blocks) {
      parts.push(this.renderBlock(block));
    }
    return parts.join("\n");
  }

  private renderBlock(block: Block): string {
    switch (block.kind) {
      case "heading":
        return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      case "paragraph":
        return `<p>${escapeHtml(block.text)}</p>`;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items.map((i) => `  <li>${escapeHtml(i)}</li>`).join("\n");
        return `<${tag}>\n${items}\n</${tag}>`;
      }
      case "table": {
        const head = block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const body = block.rows
          .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
          .join("\n");
        return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
      }
    }
  }
}

/** Renders a document to GitHub-flavoured Markdown. */
export class MarkdownRenderer implements DocumentRenderer {
  readonly contentType = "text/markdown";

  render(document: DocumentModel): string {
    const parts: string[] = [];
    if (document.title !== undefined) {
      parts.push(`# ${document.title}`);
    }
    for (const block of document.blocks) {
      parts.push(this.renderBlock(block));
    }
    return parts.join("\n\n");
  }

  private renderBlock(block: Block): string {
    switch (block.kind) {
      case "heading":
        return `${"#".repeat(block.level)} ${block.text}`;
      case "paragraph":
        return block.text;
      case "list":
        return block.items
          .map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`))
          .join("\n");
      case "table": {
        const header = `| ${block.headers.join(" | ")} |`;
        const divider = `| ${block.headers.map(() => "---").join(" | ")} |`;
        const rows = block.rows.map((row) => `| ${row.join(" | ")} |`);
        return [header, divider, ...rows].join("\n");
      }
    }
  }
}

/** Renders a document to readable plain text. */
export class PlainTextRenderer implements DocumentRenderer {
  readonly contentType = "text/plain";

  render(document: DocumentModel): string {
    const parts: string[] = [];
    if (document.title !== undefined) {
      parts.push(document.title.toUpperCase());
    }
    for (const block of document.blocks) {
      parts.push(this.renderBlock(block));
    }
    return parts.join("\n\n");
  }

  private renderBlock(block: Block): string {
    switch (block.kind) {
      case "heading":
        return block.text;
      case "paragraph":
        return block.text;
      case "list":
        return block.items
          .map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `* ${item}`))
          .join("\n");
      case "table":
        return [block.headers, ...block.rows].map((row) => row.join("\t")).join("\n");
    }
  }
}
