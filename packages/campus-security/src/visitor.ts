import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyVisitorCodeError,
  EmptyVisitorNameError,
  InvalidVisitorTransitionError,
} from "./errors";
import type { VisitorStatus, VisitorType } from "./campus-security-value";

/**
 * A visitor — a known person who comes to the campus (a guest, a parent, a vendor, a contractor, an
 * official). It is the master record a visit is booked against: a code (unique per tenant), a name, a type,
 * and optional contact details. It runs `active ↔ blocked` (a deny-list freeze) and `→ archived` (a terminal
 * retire); only an active visitor can have a visit approved. Contact details are held on the aggregate and
 * never ride an event.
 */
export interface Visitor {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly fullName: string;
  readonly type: VisitorType;
  readonly phone: string | null;
  readonly email: string | null;
  readonly company: string | null;
  readonly status: VisitorStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface VisitorContact {
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly company?: string | null;
}

export interface RegisterVisitorParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly fullName: string;
  readonly type: VisitorType;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly company?: string | null;
}

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

/** Register a visitor (status `active`). Code and name required. */
export function registerVisitor(params: RegisterVisitorParams): Visitor {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyVisitorCodeError();
  }
  const fullName = params.fullName.trim();
  if (fullName.length === 0) {
    throw new EmptyVisitorNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    fullName,
    type: params.type,
    phone: clean(params.phone),
    email: clean(params.email),
    company: clean(params.company),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (visitor: Visitor, patch: Partial<Visitor>): Visitor => ({
  ...visitor,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the visitor's type; not allowed once archived (terminal). */
export function setVisitorType(visitor: Visitor, type: VisitorType): Visitor {
  if (visitor.status === "archived") {
    throw new InvalidVisitorTransitionError(visitor.status, "type-set");
  }
  return touch(visitor, { type });
}

/** Update the visitor's contact details (each field replaced); not allowed once archived. */
export function updateVisitorContact(visitor: Visitor, contact: VisitorContact): Visitor {
  if (visitor.status === "archived") {
    throw new InvalidVisitorTransitionError(visitor.status, "contact-updated");
  }
  return touch(visitor, {
    phone: clean(contact.phone),
    email: clean(contact.email),
    company: clean(contact.company),
  });
}

/** Block a visitor (→ `blocked`, a deny-list freeze on future visits). */
export function blockVisitor(visitor: Visitor): Visitor {
  if (visitor.status !== "active") {
    throw new InvalidVisitorTransitionError(visitor.status, "blocked");
  }
  return touch(visitor, { status: "blocked" });
}

/** Unblock a visitor (→ `active`). */
export function unblockVisitor(visitor: Visitor): Visitor {
  if (visitor.status !== "blocked") {
    throw new InvalidVisitorTransitionError(visitor.status, "active");
  }
  return touch(visitor, { status: "active" });
}

/** Archive a visitor (→ `archived`, terminal). */
export function archiveVisitor(visitor: Visitor): Visitor {
  if (visitor.status === "archived") {
    throw new InvalidVisitorTransitionError(visitor.status, "archived");
  }
  return touch(visitor, { status: "archived" });
}

/** Whether the visitor is active and may have a visit approved. */
export const isVisitorActive = (visitor: Visitor): boolean => visitor.status === "active";
