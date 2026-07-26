import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { activateComfortPolicy, draftComfortPolicy } from "./comfort-policy";
import { ComfortAssessmentService } from "./comfort-assessment-service";
import { recordReading } from "./environment-reading";
import {
  InMemoryComfortPolicyRepository,
  InMemoryEnvironmentReadingRepository,
  InMemorySpaceRepository,
} from "./ports";
import { createSpace } from "./space";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;
const sensorId = "55555555-5555-5555-5555-555555555555" as Uuid;

const setup = async () => {
  const readings = new InMemoryEnvironmentReadingRepository();
  const policies = new InMemoryComfortPolicyRepository();
  const spaces = new InMemorySpaceRepository();
  const space = createSpace({
    tenantId,
    organizationId,
    buildingId,
    code: "R-101",
    type: "classroom",
    floor: 1,
    capacity: 30,
  });
  await spaces.save(space);
  const service = new ComfortAssessmentService({ readings, policies, spaces });
  const reading = (metric: "temperature" | "co2", value: number, recordedAt: string) =>
    readings.save(
      recordReading({
        tenantId,
        organizationId,
        buildingId,
        spaceId: space.id,
        sensorId,
        metric,
        value,
        recordedAt,
      }),
    );
  const activatePolicy = () =>
    policies.save(
      activateComfortPolicy(
        draftComfortPolicy({
          tenantId,
          organizationId,
          name: "Classroom comfort",
          thresholds: [
            { metric: "temperature", min: 18, max: 26 },
            { metric: "co2", min: 0, max: 1000 },
          ],
        }),
      ),
    );
  return { readings, policies, spaces, service, space, reading, activatePolicy };
};

describe("ComfortAssessmentService", () => {
  it("assesses a space against the active policy and its latest readings", async () => {
    const { service, space, reading, activatePolicy } = await setup();
    await activatePolicy();
    await reading("temperature", 30, "2026-07-01T09:00:00.000Z"); // breaches (max 26)
    await reading("co2", 500, "2026-07-01T09:00:00.000Z"); // within range
    const a = await service.assessSpace(tenantId, space.id);
    expect(a.readingCount).toBe(2);
    expect(a.breachCount).toBe(1);
    expect(a.breachingMetrics).toEqual(["temperature"]);
    expect(a.band).toBe("marginal");
  });

  it("reads comfortable when no policy is active (no thresholds to breach)", async () => {
    const { service, space, reading } = await setup();
    await reading("temperature", 35, "2026-07-01T09:00:00.000Z");
    const a = await service.assessSpace(tenantId, space.id);
    expect(a.band).toBe("comfortable");
    expect(a.breachCount).toBe(0);
  });

  it("rejects an unknown space", async () => {
    const { service } = await setup();
    await expect(service.assessSpace(tenantId, "missing" as Uuid)).rejects.toThrow(/Space/);
  });
});
