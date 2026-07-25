import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const currency = z.string().regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code");
const minorNonNeg = z.number().int().nonnegative();
const minorPositive = z.number().int().positive();
const qtyPositive = z.number().int().positive();

// --- Supplier --------------------------------------------------------------------
export const createSupplierSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  category: nullableText.optional(),
  contactEmail: nullableText.optional(),
  contactPhone: nullableText.optional(),
});
export const renameSupplierSchema = z.object({ name: nonEmpty });
export const setSupplierCategorySchema = z.object({ category: nullableText });
export const setSupplierContactSchema = z.object({
  contactEmail: nullableText,
  contactPhone: nullableText,
});

// --- Inventory item --------------------------------------------------------------
export const createItemSchema = z.object({
  organizationId: uuid,
  sku: nonEmpty,
  name: nonEmpty,
  unitOfMeasure: nonEmpty,
  reorderLevel: minorNonNeg,
  category: nullableText.optional(),
  standardCostMinor: minorNonNeg.optional(),
  currency: currency.optional(),
});
export const renameItemSchema = z.object({ name: nonEmpty });
export const setItemCategorySchema = z.object({ category: nullableText });
export const setReorderLevelSchema = z.object({ reorderLevel: minorNonNeg });
export const setStandardCostSchema = z.object({
  amountMinor: minorNonNeg.nullable(),
  currency: currency.nullable(),
});

// --- Stock movement --------------------------------------------------------------
const movementType = z.enum(["receipt", "issue", "adjustment"]);
export const recordMovementSchema = z.object({
  itemId: uuid,
  type: movementType,
  quantity: z.number().int(),
  occurredAt: nonEmpty,
  reason: nullableText.optional(),
  reference: nullableText.optional(),
});

// --- Purchase requisition --------------------------------------------------------
const requisitionLineInput = z.object({
  key: nonEmpty,
  description: nonEmpty,
  quantity: qtyPositive,
  estimatedUnitCostMinor: minorNonNeg,
});
export const draftRequisitionSchema = z.object({
  requesterId: uuid,
  title: nonEmpty,
  currency,
  justification: nullableText.optional(),
  lines: z.array(requisitionLineInput).optional(),
});
export const setRequisitionJustificationSchema = z.object({ justification: nullableText });
export const addRequisitionLineSchema = requisitionLineInput;
export const reviewRequisitionSchema = z.object({ reviewNote: nullableText.optional() });

// --- Purchase order --------------------------------------------------------------
const orderLineInput = z.object({
  key: nonEmpty,
  description: nonEmpty,
  quantity: qtyPositive,
  unitPriceMinor: minorNonNeg,
  itemId: uuid.optional(),
});
export const draftOrderSchema = z.object({
  supplierId: uuid,
  number: nonEmpty,
  currency,
  requisitionId: uuid.optional(),
  expectedDate: nullableText.optional(),
  lines: z.array(orderLineInput).optional(),
});
export const addOrderLineSchema = orderLineInput;
export const receiveOrderSchema = z.object({
  key: nonEmpty,
  quantity: qtyPositive,
  occurredAt: nonEmpty,
});

// --- Asset -----------------------------------------------------------------------
export const registerAssetSchema = z.object({
  organizationId: uuid,
  assetTag: nonEmpty,
  name: nonEmpty,
  acquisitionCostMinor: minorNonNeg,
  salvageValueMinor: minorNonNeg,
  currency,
  acquisitionDate: nonEmpty,
  usefulLifeMonths: minorPositive,
  category: nullableText.optional(),
  custodianId: uuid.optional(),
  location: nullableText.optional(),
});
export const renameAssetSchema = z.object({ name: nonEmpty });
export const setAssetCategorySchema = z.object({ category: nullableText });
export const setAssetLocationSchema = z.object({ location: nullableText });
export const assignCustodianSchema = z.object({ custodianId: uuid.nullable() });

// --- Asset maintenance -----------------------------------------------------------
export const scheduleMaintenanceSchema = z.object({
  assetId: uuid,
  description: nonEmpty,
  scheduledDate: nullableText.optional(),
  notes: nullableText.optional(),
});
export const setMaintenanceScheduleSchema = z.object({ scheduledDate: nullableText });
export const completeMaintenanceSchema = z.object({
  performedDate: nonEmpty,
  costMinor: minorNonNeg.optional(),
  currency: currency.optional(),
  notes: nullableText.optional(),
});
export const cancelMaintenanceSchema = z.object({ notes: nullableText.optional() });
