import { describe, expect, it } from "vitest";
import { DocumentBuilder } from "./document-model";
import { HtmlRenderer, MarkdownRenderer, PlainTextRenderer } from "./renderers";

const sample = new DocumentBuilder()
  .title("Report")
  .heading(2, "Summary")
  .paragraph("All systems nominal.")
  .list(["alpha", "beta"], false)
  .table(["Name", "Value"], [["cpu", "12%"]])
  .build();

describe("DocumentBuilder", () => {
  it("assembles a structured document", () => {
    expect(sample.title).toBe("Report");
    expect(sample.blocks).toHaveLength(4);
    expect(sample.blocks[0]).toEqual({ kind: "heading", level: 2, text: "Summary" });
  });
});

describe("HtmlRenderer", () => {
  const html = new HtmlRenderer().render(sample);
  it("emits escaped semantic HTML", () => {
    expect(html).toContain("<h1>Report</h1>");
    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<td>cpu</td>");
  });
  it("escapes HTML-special characters", () => {
    const doc = new DocumentBuilder().paragraph("a < b & c > d").build();
    expect(new HtmlRenderer().render(doc)).toBe("<p>a &lt; b &amp; c &gt; d</p>");
  });
});

describe("MarkdownRenderer", () => {
  it("emits GitHub-flavoured markdown", () => {
    const md = new MarkdownRenderer().render(sample);
    expect(md).toContain("# Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("- alpha");
    expect(md).toContain("| Name | Value |");
    expect(md).toContain("| --- | --- |");
  });
});

describe("PlainTextRenderer", () => {
  it("emits readable plain text", () => {
    const text = new PlainTextRenderer().render(sample);
    expect(text).toContain("REPORT");
    expect(text).toContain("* alpha");
    expect(text).toContain("cpu\t12%");
  });
});
