import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

const cardinality = z.enum(["one_to_one", "one_to_many", "many_to_one", "many_to_many"]);
const assertionMethod = z.enum(["observed", "declared", "derived", "inferred"]);
const subjectKind = z.enum(["entity", "relationship"]);

// --- Entity type (ontology:*) ----------------------------------------------------
export const createEntityTypeSchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  label: nonEmpty,
  description: nullableText.optional(),
});
export const describeEntityTypeSchema = z.object({
  label: nonEmpty.optional(),
  description: nullableText.optional(),
});

// --- Relationship type (ontology:*) ----------------------------------------------
export const createRelationshipTypeSchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  label: nonEmpty,
  sourceEntityTypeKey: nonEmpty,
  targetEntityTypeKey: nonEmpty,
  cardinality,
  description: nullableText.optional(),
});
export const describeRelationshipTypeSchema = z.object({
  label: nonEmpty.optional(),
  description: nullableText.optional(),
});
export const setCardinalitySchema = z.object({ cardinality });

// --- Knowledge entity (knowledge:*) ----------------------------------------------
export const createEntitySchema = z.object({
  organizationId: uuid,
  entityTypeKey: nonEmpty,
  sourceDomain: nonEmpty,
  sourceRef: nonEmpty,
  label: nullableText.optional(),
});
export const relabelEntitySchema = z.object({ label: nullableText });
export const mergeEntitySchema = z.object({ intoId: uuid });

// --- Semantic relationship (knowledge:*) -----------------------------------------
export const assertRelationshipSchema = z.object({
  organizationId: uuid,
  relationshipTypeKey: nonEmpty,
  sourceEntityId: uuid,
  targetEntityId: uuid,
  validFrom: nonEmpty.optional(),
  validTo: nullableText.optional(),
});
export const closeRelationshipSchema = z.object({ validTo: nonEmpty });
export const supersedeRelationshipSchema = z.object({
  validFrom: nonEmpty.optional(),
  validTo: nullableText.optional(),
});

// --- Assertion (knowledge:*) -----------------------------------------------------
export const makeAssertionSchema = z.object({
  organizationId: uuid,
  subjectKind,
  subjectId: uuid,
  predicate: nonEmpty,
  value: nonEmpty,
  method: assertionMethod,
  confidence: z.number().int(),
  evidenceSource: nullableText.optional(),
  evidenceRef: nullableText.optional(),
  derivedFrom: z.array(uuid).optional(),
  assertedOn: nonEmpty.optional(),
});
