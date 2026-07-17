import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ServicesController } from "./services.controller";
import { ServicesModule } from "./services.module";

describe("ServicesModule (integration)", () => {
  it("compiles the shared-services DI graph", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ServicesModule] }).compile();
    expect(moduleRef.get(ServicesController)).toBeInstanceOf(ServicesController);
    await moduleRef.close();
  });

  it("exposes the capability catalog", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ServicesModule] }).compile();
    const controller = moduleRef.get(ServicesController);
    const names = controller.catalog().services.map((s) => s.name);
    expect(names).toContain("cache");
    expect(names).toContain("search");
    expect(names).toContain("events");
    await moduleRef.close();
  });

  it("round-trips the wired singletons in a self-test", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ServicesModule] }).compile();
    const controller = moduleRef.get(ServicesController);
    const result = await controller.selftest();
    expect(result.cache).toBe("ok");
    expect(result.search).toBe(1);
    expect(result.documentPreview).toContain("<h2>Self-test</h2>");
    await moduleRef.close();
  });
});
