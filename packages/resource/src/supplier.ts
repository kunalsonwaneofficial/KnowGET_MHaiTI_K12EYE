import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptySupplierCodeError,
  EmptySupplierNameError,
  InvalidSupplierTransitionError,
} from "./errors";
import type { SupplierStatus } from "./resource-value";

/**
 * A supplier (vendor) — an organization the institution procures from. It runs `active → suspended`
 * (and back) while a relationship is paused, or `active | suspended → blacklisted` when permanently
 * barred (a terminal state). The `code` is unique within the tenant; purchase orders reference an
 * active supplier.
 */
export interface Supplier {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly category: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly status: SupplierStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSupplierParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly category?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
}

/** Register a supplier (status `active`). Code and name required. */
export function createSupplier(params: CreateSupplierParams): Supplier {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptySupplierCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptySupplierNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    category: params.category?.trim() || null,
    contactEmail: params.contactEmail?.trim() || null,
    contactPhone: params.contactPhone?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (supplier: Supplier, patch: Partial<Supplier>): Supplier => ({
  ...supplier,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a supplier. */
export function renameSupplier(supplier: Supplier, name: string): Supplier {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptySupplierNameError();
  }
  return touch(supplier, { name: trimmed });
}

/** Set (or clear) the supplier's category. */
export const setSupplierCategory = (supplier: Supplier, category: string | null): Supplier =>
  touch(supplier, { category: category?.trim() || null });

/** Set (or clear) the supplier's contact details. */
export const setSupplierContact = (
  supplier: Supplier,
  contactEmail: string | null,
  contactPhone: string | null,
): Supplier =>
  touch(supplier, {
    contactEmail: contactEmail?.trim() || null,
    contactPhone: contactPhone?.trim() || null,
  });

/** Suspend an active supplier (→ `suspended`). */
export function suspendSupplier(supplier: Supplier): Supplier {
  if (supplier.status !== "active") {
    throw new InvalidSupplierTransitionError(supplier.status, "suspended");
  }
  return touch(supplier, { status: "suspended" });
}

/** Reinstate a suspended supplier (→ `active`). */
export function reinstateSupplier(supplier: Supplier): Supplier {
  if (supplier.status !== "suspended") {
    throw new InvalidSupplierTransitionError(supplier.status, "active");
  }
  return touch(supplier, { status: "active" });
}

/** Blacklist a supplier permanently (→ `blacklisted`). */
export function blacklistSupplier(supplier: Supplier): Supplier {
  if (supplier.status === "blacklisted") {
    throw new InvalidSupplierTransitionError(supplier.status, "blacklisted");
  }
  return touch(supplier, { status: "blacklisted" });
}

/** Whether the supplier is currently active (usable for new orders). */
export const isSupplierActive = (supplier: Supplier): boolean => supplier.status === "active";
