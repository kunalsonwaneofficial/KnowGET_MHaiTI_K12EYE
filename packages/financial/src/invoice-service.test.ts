import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateInvoiceNumberError, StudentNotFoundForFinanceError } from "./errors";
import { InvoiceService } from "./invoice-service";
import { InMemoryInvoiceRepository, type StudentDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const students: StudentDirectory = {
  exists: async (_t, id) => id === STUDENT,
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

function service(): { svc: InvoiceService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new InvoiceService({
    repository: new InMemoryInvoiceRepository(),
    students,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const draftInput = (number = "INV-001") =>
  ({
    tenantId: TENANT,
    studentId: STUDENT,
    number,
    currency: "INR",
    dueDate: "2025-05-15",
    lines: [{ key: "tuition", description: "Tuition", amountMinor: 600000 }],
  }) as const;

describe("InvoiceService", () => {
  it("drafts deriving the organization from the student and enforcing a unique number", async () => {
    const { svc } = service();
    const inv = await svc.draft(draftInput());
    expect(inv.organizationId).toBe(ORG);
    await expect(svc.draft(draftInput("INV-001"))).rejects.toBeInstanceOf(
      DuplicateInvoiceNumberError,
    );
    expect((await svc.getByNumber(TENANT, "INV-001")).id).toBe(inv.id);
  });

  it("rejects an unknown student", async () => {
    const { svc } = service();
    await expect(
      svc.draft({ ...draftInput(), studentId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(StudentNotFoundForFinanceError);
  });

  it("issues, applies a settling payment (publishing paid), and marks overdue", async () => {
    const { svc, events } = service();
    const inv = await svc.draft(draftInput());
    await svc.issue(TENANT, inv.id);
    await svc.applyClearedPayment(TENANT, inv.id, 600000);
    expect((await svc.getById(TENANT, inv.id)).status).toBe("paid");

    const other = await svc.draft(draftInput("INV-002"));
    await svc.issue(TENANT, other.id);
    await svc.markOverdue(TENANT, other.id);
    expect(events.map((e) => e.type)).toEqual([
      "finance.invoice.issued",
      "finance.invoice.paid",
      "finance.invoice.issued",
      "finance.invoice.overdue",
    ]);
  });
});
