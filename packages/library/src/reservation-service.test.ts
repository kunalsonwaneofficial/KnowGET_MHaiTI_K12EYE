import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { registerMember, suspendMember } from "./library-member";
import {
  InMemoryLibraryMemberRepository,
  InMemoryReservationRepository,
  InMemoryTitleRepository,
} from "./ports";
import { ReservationService } from "./reservation-service";
import { catalogTitle, withdrawTitle } from "./title";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const personA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const personB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;

const setup = async () => {
  const repository = new InMemoryReservationRepository();
  const titles = new InMemoryTitleRepository();
  const members = new InMemoryLibraryMemberRepository();
  const title = catalogTitle({ tenantId, organizationId, title: "Clean Code", type: "book" });
  await titles.save(title);
  const memberA = registerMember({
    tenantId,
    organizationId,
    personId: personA,
    membershipNumber: "M-A",
    category: "student",
    joinedOn: "d",
  });
  const memberB = registerMember({
    tenantId,
    organizationId,
    personId: personB,
    membershipNumber: "M-B",
    category: "faculty",
    joinedOn: "d",
  });
  await members.save(memberA);
  await members.save(memberB);
  const service = new ReservationService({ repository, titles, members });
  return { repository, titles, members, service, title, memberA, memberB };
};

describe("ReservationService.place", () => {
  it("places holds with ascending queue positions", async () => {
    const { service, title, memberA, memberB } = await setup();
    const first = await service.place({
      tenantId,
      titleId: title.id,
      memberId: memberA.id,
      requestedOn: "d",
    });
    const second = await service.place({
      tenantId,
      titleId: title.id,
      memberId: memberB.id,
      requestedOn: "d",
    });
    expect(first.queuePosition).toBe(1);
    expect(second.queuePosition).toBe(2);
  });

  it("rejects an inactive/withdrawn title, an inactive member, and a duplicate open hold", async () => {
    const { service, titles, members, title, memberA } = await setup();
    await service.place({ tenantId, titleId: title.id, memberId: memberA.id, requestedOn: "d" });
    await expect(
      service.place({ tenantId, titleId: title.id, memberId: memberA.id, requestedOn: "d" }),
    ).rejects.toThrow(/already has an open reservation/);
    await members.save(suspendMember(memberA));
    await expect(
      service.place({ tenantId, titleId: title.id, memberId: memberA.id, requestedOn: "d" }),
    ).rejects.toThrow(/not active/);
    await titles.save(withdrawTitle(title));
    await expect(
      service.place({ tenantId, titleId: title.id, memberId: memberA.id, requestedOn: "d" }),
    ).rejects.toThrow(/not active/);
  });
});

describe("ReservationService flow", () => {
  it("marks ready, fulfils, and frees the member for a new hold", async () => {
    const { service, title, memberA } = await setup();
    const r = await service.place({
      tenantId,
      titleId: title.id,
      memberId: memberA.id,
      requestedOn: "d",
    });
    await service.markReady(tenantId, r.id, "2026-01-05", "2026-01-08");
    const fulfilled = await service.fulfill(tenantId, r.id);
    expect(fulfilled.status).toBe("fulfilled");
    // member A can place a fresh hold now that the prior is closed
    const again = await service.place({
      tenantId,
      titleId: title.id,
      memberId: memberA.id,
      requestedOn: "d",
    });
    expect(again.status).toBe("requested");
  });
});
