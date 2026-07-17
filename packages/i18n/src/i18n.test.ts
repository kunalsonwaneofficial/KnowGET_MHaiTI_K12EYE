import { describe, expect, it } from "vitest";
import { fallbackChain, interpolate } from "./message-catalog";
import { Translator } from "./translator";

describe("interpolate", () => {
  it("substitutes known placeholders and leaves unknown ones", () => {
    expect(interpolate("Hi {name}, you have {n}", { name: "Kunal" })).toBe(
      "Hi Kunal, you have {n}",
    );
  });
});

describe("fallbackChain", () => {
  it("orders specific to general and appends the default", () => {
    expect(fallbackChain("en-US", "en")).toEqual(["en-US", "en"]);
    expect(fallbackChain("fr-CA", "en")).toEqual(["fr-CA", "fr", "en"]);
  });
});

describe("Translator", () => {
  it("translates and interpolates", () => {
    const t = new Translator({ defaultLocale: "en" });
    t.addCatalog("en", { greeting: "Hello, {name}!" });
    expect(t.translate("greeting", { name: "World" })).toBe("Hello, World!");
  });

  it("falls back from a specific locale to the base and default", () => {
    const t = new Translator({ defaultLocale: "en" });
    t.addCatalog("en", { hi: "Hello", bye: "Goodbye" });
    t.addCatalog("en-US", { hi: "Howdy" });
    expect(t.translate("hi", {}, { locale: "en-US" })).toBe("Howdy");
    expect(t.translate("bye", {}, { locale: "en-US" })).toBe("Goodbye");
  });

  it("selects plural variants by count", () => {
    const t = new Translator({ defaultLocale: "en" });
    t.addCatalog("en", {
      items: { one: "{count} item", other: "{count} items" },
    });
    expect(t.translate("items", {}, { count: 1 })).toBe("1 item");
    expect(t.translate("items", {}, { count: 5 })).toBe("5 items");
  });

  it("returns the key when a message is missing", () => {
    const t = new Translator({ defaultLocale: "en" });
    expect(t.translate("nope")).toBe("nope");
    expect(t.has("nope")).toBe(false);
  });
});
