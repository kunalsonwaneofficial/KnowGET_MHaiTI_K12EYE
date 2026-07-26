import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EventRegistrationService } from "./event-registration-service";
import { createAlumniEvent, openEvent, scheduleEvent } from "./alumni-event";
import { createAlumniProfile } from "./alumni-profile";
import {
  InMemoryAlumniEventRepository,
  InMemoryAlumniProfileRepository,
  InMemoryEventRegistrationRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumnusPersonId = "33333333-3333-3333-3333-333333333333" as Uuid;

const setup = async (open = true) => {
  const repository = new InMemoryEventRegistrationRepository();
  const alumniEvents = new InMemoryAlumniEventRepository();
  const profiles = new InMemoryAlumniProfileRepository();
  const events: DomainEvent[] = [];

  let event = createAlumniEvent({
    tenantId,
    organizationId,
    code: "R25",
    name: "Reunion",
    type: "reunion",
    capacity: 100,
  });
  if (open) {
    event = openEvent(scheduleEvent(event));
  }
  await alumniEvents.save(event);

  const profile = createAlumniProfile({
    tenantId,
    organizationId,
    alumnusPersonId,
    graduationYear: "2015",
  });
  await profiles.save(profile);

  const service = new EventRegistrationService({
    repository,
    alumniEvents,
    profiles,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, event, profile, events };
};

describe("EventRegistrationService", () => {
  it("registers, blocks a duplicate, and reinstates after cancel (one row)", async () => {
    const { repository, service, event, profile, events } = await setup();
    const r = await service.register({
      tenantId,
      eventId: event.id,
      alumniProfileId: profile.id,
      registeredOn: "2026-02-01",
    });
    await expect(
      service.register({
        tenantId,
        eventId: event.id,
        alumniProfileId: profile.id,
        registeredOn: "d",
      }),
    ).rejects.toThrow(/already registered/);

    await service.cancel(tenantId, r.id, "2026-02-10");
    const reinstated = await service.register({
      tenantId,
      eventId: event.id,
      alumniProfileId: profile.id,
      registeredOn: "2026-02-20",
    });
    expect(reinstated.id).toBe(r.id);
    expect(reinstated.status).toBe("registered");
    expect((await repository.listByEvent(tenantId, event.id)).length).toBe(1);
    expect(events.map((e) => e.type)).toContain("alumni.registration.reinstated");
  });

  it("rejects registering for a non-open event and an unknown alumnus", async () => {
    const { service: draft, event: de, profile: dp } = await setup(false);
    await expect(
      draft.register({ tenantId, eventId: de.id, alumniProfileId: dp.id, registeredOn: "d" }),
    ).rejects.toThrow(/not open/);

    const { service, event } = await setup();
    await expect(
      service.register({
        tenantId,
        eventId: event.id,
        alumniProfileId: "00000000-0000-0000-0000-000000000000" as Uuid,
        registeredOn: "d",
      }),
    ).rejects.toThrow(/Alumni profile/);
  });
});
