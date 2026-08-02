import { describe, expect, it } from "vitest";
import {
  assessCompatibility,
  breakingChangeKinds,
  describeSchemaChanges,
  validateSchemaFields,
} from "./compatibility";
import {
  DuplicateSchemaFieldError,
  EmptySchemaError,
  InvalidSchemaFieldNameError,
  TooManySchemaFieldsError,
} from "./errors";
import {
  COMPATIBILITY_MODES,
  type CompatibilityMode,
  MAX_KEY_LENGTH,
  MAX_SCHEMA_FIELDS,
  type SchemaField,
  type SchemaFieldType,
} from "./mesh-value";
import type { CompatibilityVerdict } from "./mesh-view";

const KEY = "student-lifecycle.enrolment.confirmed";

const required = (name: string, type: SchemaFieldType = "string"): SchemaField => ({
  name,
  type,
  required: true,
});

const optional = (name: string, type: SchemaFieldType = "string"): SchemaField => ({
  name,
  type,
  required: false,
});

const kindsOf = (previous: readonly SchemaField[], next: readonly SchemaField[]): string[] =>
  describeSchemaChanges(KEY, previous, next).map((entry) => entry.kind);

describe("validating a schema", () => {
  it("refuses a schema that declares nothing, because it would validate everything", () => {
    expect(() => validateSchemaFields(KEY, [])).toThrow(EmptySchemaError);
  });

  it("refuses more fields than the platform compares", () => {
    const many = Array.from({ length: MAX_SCHEMA_FIELDS + 1 }, (_, index) =>
      required(`field_${index}`),
    );
    expect(() => validateSchemaFields(KEY, many)).toThrow(TooManySchemaFieldsError);
    expect(() => validateSchemaFields(KEY, many.slice(0, MAX_SCHEMA_FIELDS))).not.toThrow();
  });

  it("refuses a name declared twice, rather than choosing one of the two declarations", () => {
    expect(() =>
      validateSchemaFields(KEY, [required("learnerId", "uuid"), optional("learnerId", "string")]),
    ).toThrow(DuplicateSchemaFieldError);
  });

  it("treats names that differ only in case as the two properties they are", () => {
    expect(() =>
      validateSchemaFields(KEY, [required("learnerId"), required("learnerid")]),
    ).not.toThrow();
  });

  it("refuses a name that could not be read as a payload property", () => {
    expect(() => validateSchemaFields(KEY, [required("learner id")])).toThrow(
      InvalidSchemaFieldNameError,
    );
    expect(() => validateSchemaFields(KEY, [required("learner-id")])).toThrow(
      InvalidSchemaFieldNameError,
    );
    expect(() => validateSchemaFields(KEY, [required("9lives")])).toThrow(
      InvalidSchemaFieldNameError,
    );
    expect(() => validateSchemaFields(KEY, [required("")])).toThrow(InvalidSchemaFieldNameError);
  });

  it("refuses a name longer than a key may be", () => {
    expect(() => validateSchemaFields(KEY, [required("a".repeat(MAX_KEY_LENGTH))])).not.toThrow();
    expect(() => validateSchemaFields(KEY, [required("a".repeat(MAX_KEY_LENGTH + 1))])).toThrow(
      InvalidSchemaFieldNameError,
    );
  });

  it("accepts the camel-cased names every publishing contract actually uses", () => {
    const fields = validateSchemaFields(KEY, [
      required("learnerId", "uuid"),
      required("admittedAt", "instant"),
      optional("_internalNote"),
    ]);
    expect(fields.map((entry) => entry.name)).toEqual(["learnerId", "admittedAt", "_internalNote"]);
  });

  it("trims a name and hands back a frozen copy", () => {
    const fields = validateSchemaFields(KEY, [
      { name: "  learnerId  ", type: "uuid", required: true },
    ]);
    expect(fields).toEqual([{ name: "learnerId", type: "uuid", required: true }]);
    expect(Object.isFrozen(fields)).toBe(true);
    expect(Object.isFrozen(fields[0])).toBe(true);
  });
});

describe("describing what changed", () => {
  it("finds nothing between a schema and itself", () => {
    const schema = [required("learnerId", "uuid"), optional("note")];
    expect(describeSchemaChanges(KEY, schema, schema)).toEqual([]);
  });

  it("names an addition by whether the reader will be obliged to find it", () => {
    expect(kindsOf([required("learnerId")], [required("learnerId"), required("cohortId")])).toEqual(
      ["added_required"],
    );
    expect(kindsOf([required("learnerId")], [required("learnerId"), optional("cohortId")])).toEqual(
      ["added_optional"],
    );
  });

  it("names a removal by whether anybody was obliged to find it", () => {
    expect(kindsOf([required("learnerId"), required("cohortId")], [required("learnerId")])).toEqual(
      ["removed_required"],
    );
    expect(kindsOf([required("learnerId"), optional("cohortId")], [required("learnerId")])).toEqual(
      ["removed_optional"],
    );
  });

  it("separates a promise being tightened from one being loosened", () => {
    expect(kindsOf([optional("note")], [required("note")])).toEqual(["tightened"]);
    expect(kindsOf([required("note")], [optional("note")])).toEqual(["loosened"]);
  });

  it("reports one field that changed in two ways as two things that broke", () => {
    const changes = describeSchemaChanges(
      KEY,
      [optional("amount", "string")],
      [required("amount", "number")],
    );
    expect(changes.map((entry) => entry.kind)).toEqual(["retyped", "tightened"]);
    expect(changes.every((entry) => entry.field === "amount")).toBe(true);
  });

  it("carries the declared type on either side, and null where the field was not there", () => {
    const added = describeSchemaChanges(
      KEY,
      [required("learnerId")],
      [required("learnerId"), required("cohortId", "uuid")],
    );
    expect(added).toEqual([
      {
        kind: "added_required",
        field: "cohortId",
        from: null,
        to: "uuid",
        description: 'added the required field "cohortId"',
      },
    ]);

    const removed = describeSchemaChanges(
      KEY,
      [required("learnerId"), optional("cohortId", "uuid")],
      [required("learnerId")],
    );
    expect(removed).toEqual([
      {
        kind: "removed_optional",
        field: "cohortId",
        from: "uuid",
        to: null,
        description: 'removed the optional field "cohortId"',
      },
    ]);
  });

  it("holds the same type on both sides when only the promise about it moved", () => {
    expect(
      describeSchemaChanges(KEY, [optional("note", "string")], [required("note", "string")]),
    ).toEqual([
      {
        kind: "tightened",
        field: "note",
        from: "string",
        to: "string",
        description: 'made the optional field "note" required',
      },
    ]);
  });

  it("writes the sentence an operator reads for a retype", () => {
    const changes = describeSchemaChanges(
      KEY,
      [required("amount", "string")],
      [required("amount", "number")],
    );
    expect(changes[0]?.description).toBe('changed the type of "amount" from "string" to "number"');
  });

  it("orders by field name, not by declaration order or by kind", () => {
    const changes = describeSchemaChanges(
      KEY,
      [required("zebra"), required("alpha"), required("keeper")],
      [required("keeper"), optional("beta")],
    );
    expect(changes.map((entry) => entry.field)).toEqual(["alpha", "beta", "zebra"]);
  });

  it("validates both sides, so a malformed predecessor is refused too", () => {
    expect(() => describeSchemaChanges(KEY, [], [required("learnerId")])).toThrow(EmptySchemaError);
    expect(() => describeSchemaChanges(KEY, [required("learnerId")], [])).toThrow(EmptySchemaError);
  });

  it("is blind to the mode, so a change can be shown even where nothing forbids it", () => {
    expect(kindsOf([required("learnerId")], [required("learnerId"), required("cohortId")])).toEqual(
      ["added_required"],
    );
  });
});

describe("which differences a mode forbids", () => {
  it("refuses under backward exactly what stops a new reader reading old data", () => {
    expect(breakingChangeKinds("backward")).toEqual(["added_required", "retyped", "tightened"]);
  });

  it("refuses under forward exactly what stops an old reader reading new data", () => {
    expect(breakingChangeKinds("forward")).toEqual(["loosened", "removed_required", "retyped"]);
  });

  it("refuses under full the union of the two directions and nothing besides", () => {
    const union = [
      ...new Set([...breakingChangeKinds("backward"), ...breakingChangeKinds("forward")]),
    ].sort();
    expect([...breakingChangeKinds("full")].sort()).toEqual(union);
    expect(breakingChangeKinds("full")).toEqual([
      "added_required",
      "loosened",
      "removed_required",
      "retyped",
      "tightened",
    ]);
  });

  it("refuses nothing under none, which is the entire meaning of choosing it", () => {
    expect(breakingChangeKinds("none")).toEqual([]);
  });

  it("never forbids an optional addition or an optional removal, under any mode", () => {
    for (const mode of COMPATIBILITY_MODES) {
      expect(breakingChangeKinds(mode)).not.toContain("added_optional");
      expect(breakingChangeKinds(mode)).not.toContain("removed_optional");
    }
  });
});

describe("assessing a proposed version", () => {
  const previous = [required("learnerId", "uuid"), required("admittedAt", "instant")];

  const verdict = (mode: CompatibilityMode, next: readonly SchemaField[]): CompatibilityVerdict =>
    assessCompatibility({ eventTypeKey: KEY, mode, previous, next });

  it("passes an unchanged schema under every mode", () => {
    for (const mode of COMPATIBILITY_MODES) {
      const result = verdict(mode, previous);
      expect(result.compatible).toBe(true);
      expect(result.changes).toEqual([]);
      expect(result.breakingChanges).toEqual([]);
      expect(result.mode).toBe(mode);
    }
  });

  it("lets an upgrading reader keep reading history: optional additions and free removals", () => {
    const next = [required("learnerId", "uuid"), optional("cohortId", "uuid")];
    const result = verdict("backward", next);
    expect(result.compatible).toBe(true);
    expect(result.changes.map((entry) => entry.kind)).toEqual([
      "removed_required",
      "added_optional",
    ]);
  });

  it("refuses under backward a field the new reader requires and history never carried", () => {
    const result = verdict("backward", [...previous, required("cohortId", "uuid")]);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges).toEqual(['added the required field "cohortId"']);
  });

  it("lets a producer move ahead of its subscribers: additions and optional removals", () => {
    const next = [...previous, required("cohortId", "uuid")];
    const result = verdict("forward", next);
    expect(result.compatible).toBe(true);
    expect(result.changes.map((entry) => entry.kind)).toEqual(["added_required"]);
  });

  it("refuses under forward a field the old reader still requires", () => {
    const result = verdict("forward", [required("learnerId", "uuid")]);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges).toEqual(['removed the required field "admittedAt"']);
  });

  it("refuses a retype in both directions, and so under full as well", () => {
    const next = [required("learnerId", "string"), required("admittedAt", "instant")];
    for (const mode of ["backward", "forward", "full"] as const) {
      const result = verdict(mode, next);
      expect(result.compatible).toBe(false);
      expect(result.breakingChanges).toEqual([
        'changed the type of "learnerId" from "uuid" to "string"',
      ]);
    }
  });

  it("permits under full only what both directions permit", () => {
    expect(verdict("full", [...previous, optional("cohortId", "uuid")]).compatible).toBe(true);
    expect(verdict("full", [...previous, required("cohortId", "uuid")]).compatible).toBe(false);
    expect(verdict("full", [required("learnerId", "uuid")]).compatible).toBe(false);
  });

  it("permits everything under none while still reporting all of it", () => {
    const next = [required("learnerId", "string"), required("cohortId", "uuid")];
    const result = verdict("none", next);
    expect(result.compatible).toBe(true);
    expect(result.breakingChanges).toEqual([]);
    expect(result.changes.map((entry) => entry.kind)).toEqual([
      "removed_required",
      "added_required",
      "retyped",
    ]);
  });

  it("reports the same differences under every mode and reaches different verdicts", () => {
    const next = [...previous, required("cohortId", "uuid")];
    const strict = verdict("backward", next);
    const lax = verdict("none", next);
    expect(strict.changes).toEqual(lax.changes);
    expect(strict.compatible).toBe(false);
    expect(lax.compatible).toBe(true);
  });

  it("carries the breaking descriptions in the order the changes were found", () => {
    const next = [optional("admittedAt", "string"), required("cohortId", "uuid")];
    const result = verdict("full", next);
    expect(result.breakingChanges).toEqual([
      'changed the type of "admittedAt" from "instant" to "string"',
      'made the required field "admittedAt" optional',
      'added the required field "cohortId"',
      'removed the required field "learnerId"',
    ]);
  });

  it("hands back a frozen verdict", () => {
    const result = verdict("backward", previous);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.breakingChanges)).toBe(true);
    expect(Object.isFrozen(result.changes)).toBe(true);
  });
});
