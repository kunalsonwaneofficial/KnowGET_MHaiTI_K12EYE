import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { accessionCopy } from "./copy";
import { registerMember, suspendMember } from "./library-member";
import { LoanService } from "./loan-service";
import {
  InMemoryCopyRepository,
  InMemoryLibraryMemberRepository,
  InMemoryLoanRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const titleId = "44444444-4444-4444-4444-444444444444" as Uuid;
const personId = "66666666-6666-6666-6666-666666666666" as Uuid;

const setup = async () => {
  const repository = new InMemoryLoanRepository();
  const copies = new InMemoryCopyRepository();
  const members = new InMemoryLibraryMemberRepository();
  const copy = accessionCopy({ tenantId, organizationId, titleId, barcode: "BC-1" });
  await copies.save(copy);
  const member = registerMember({
    tenantId,
    organizationId,
    personId,
    membershipNumber: "M-1",
    category: "student",
    joinedOn: "2026-01-01",
  });
  await members.save(member);
  const service = new LoanService({ repository, copies, members });
  return { repository, copies, members, service, copy, member };
};

const issueInput = (copyId: Uuid, memberId: Uuid, borrowingLimit = 3) => ({
  tenantId,
  copyId,
  memberId,
  issueDate: "2026-01-01",
  loanPeriodDays: 14,
  renewalLimit: 2,
  borrowingLimit,
});

describe("LoanService.issue", () => {
  it("issues an available copy to an active member and flips the copy to on-loan", async () => {
    const { service, copies, copy, member } = await setup();
    const loan = await service.issue(issueInput(copy.id, member.id));
    expect(loan.status).toBe("active");
    expect(loan.titleId).toBe(titleId);
    expect((await copies.findById(tenantId, copy.id))?.status).toBe("on_loan");
  });

  it("rejects a non-available copy (already on loan)", async () => {
    const { service, copy, member } = await setup();
    await service.issue(issueInput(copy.id, member.id));
    await expect(service.issue(issueInput(copy.id, member.id))).rejects.toThrow(/not available/);
  });

  it("rejects an inactive member", async () => {
    const { service, members, copy, member } = await setup();
    await members.save(suspendMember(member));
    await expect(service.issue(issueInput(copy.id, member.id))).rejects.toThrow(/not active/);
  });

  it("enforces the borrowing limit across active loans", async () => {
    const { service, copies, copy, member } = await setup();
    const second = accessionCopy({ tenantId, organizationId, titleId, barcode: "BC-2" });
    await copies.save(second);
    await service.issue(issueInput(copy.id, member.id, 1));
    await expect(service.issue(issueInput(second.id, member.id, 1))).rejects.toThrow(
      /borrowing limit/,
    );
  });
});

describe("LoanService return / lost / renew", () => {
  it("returns a loan and frees the copy", async () => {
    const { service, copies, copy, member } = await setup();
    const loan = await service.issue(issueInput(copy.id, member.id));
    const returned = await service.returnItem(tenantId, loan.id, "2026-01-10");
    expect(returned.status).toBe("returned");
    expect((await copies.findById(tenantId, copy.id))?.status).toBe("available");
  });

  it("marks a loan lost and loses the copy", async () => {
    const { service, copies, copy, member } = await setup();
    const loan = await service.issue(issueInput(copy.id, member.id));
    await service.markLost(tenantId, loan.id);
    expect((await copies.findById(tenantId, copy.id))?.status).toBe("lost");
  });

  it("renews within the limit", async () => {
    const { service, copy, member } = await setup();
    const loan = await service.issue(issueInput(copy.id, member.id));
    expect((await service.renew(tenantId, loan.id)).renewalsUsed).toBe(1);
  });
});
