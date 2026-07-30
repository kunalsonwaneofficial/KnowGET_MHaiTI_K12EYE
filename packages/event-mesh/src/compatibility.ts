import {
  DuplicateSchemaFieldError,
  EmptySchemaError,
  InvalidSchemaFieldNameError,
  TooManySchemaFieldsError,
} from "./errors";
import {
  type CompatibilityMode,
  MAX_KEY_LENGTH,
  MAX_SCHEMA_FIELDS,
  type SchemaField,
} from "./mesh-value";
import type {
  CompatibilityRequest,
  CompatibilityVerdict,
  SchemaChange,
  SchemaChangeKind,
} from "./mesh-view";

/**
 * The engine that turns a compatibility mode from a promise into a refusal.
 *
 * A schema registry that stores a compatibility mode and checks it in code review has documented an intention.
 * The failure the intention was meant to prevent still happens; it happens later, in somebody else's
 * deployment, at the moment the first event of the new shape arrives, and the person who caused it has moved on
 * to something else. Enforcing the mode at registration is the only point in that sequence where the cost lands
 * on the person who chose to pay it.
 *
 * **The whole check reduces to one rule applied twice.** A reader can read a payload when every field the
 * reader requires is present *and required* in that payload, and when every field the two have in common agrees
 * on its type. Apply the rule with the new schema as the reader and the old data as the payload and you have
 * `backward`; apply it with the old schema as the reader and the new data as the payload and you have
 * `forward`; `full` is not a third rule but the union of the refusals from both, computed as a union here so
 * that the claim cannot drift away from the code. This is why requiredness has to be *declared* on a
 * {@link SchemaField} rather than inferred from the payloads somebody happened to send: without it, neither
 * direction is decidable and a registry can do nothing but record what it was told.
 *
 * Working the rule through in each direction gives the permission lists the value objects document. Under
 * `backward` a version may remove fields freely — a reader on the new schema does not read what it no longer
 * declares — and may add them only as optional, because a field the new reader requires is simply not there in
 * a year of history. Under `forward` a version may add fields freely — a reader on the old schema ignores what
 * it does not know about — and may remove them only if they were optional, because a field the old reader
 * requires stops arriving the moment the new shape goes live. Type changes break both, which is the one thing
 * everybody expects a registry to catch and the least of what it should.
 *
 * **What this cannot see is a semantic change under a stable shape.** A field named `amount` that keeps its
 * name, its type and its requiredness while changing from paise to rupees passes every check in this file, and
 * the consumer that breaks on it breaks silently, having read a hundred as a hundred. That limit is structural
 * rather than an omission to be closed later by a richer schema language: the language that could express
 * *units* would be a second type system, maintained by the same people, and the field that carried the
 * judgement would be filled in by the person making the change. The honest position is that this engine catches
 * renames, removals, retypes and requiredness changes — the large majority of what actually breaks consumers —
 * and that a units change is caught by a new event type, or by nothing.
 *
 * Nothing here reads a clock, a store or a random source. A verdict is a function of two field lists and a
 * mode, which means the answer the registry gave an author in March is reproducible in November from the
 * record, and a disagreement about whether a change was breaking is settled by rerunning it rather than by
 * remembering.
 */

// --- Schema validation -----------------------------------------------------------

/**
 * What a field name may look like.
 *
 * A schema field name is read as a property name by every consumer that deserialises the payload, so the
 * grammar is the one a property name can take without being quoted: a letter or underscore, then letters,
 * digits or underscores. Deliberately not the platform's key grammar, which is lowercase and dot-separated —
 * payload fields are `learnerId` and `admittedAt` in every one of the thirty-six contracts publishing today,
 * and a registry that refused those would be a registry nobody could describe their own events in.
 */
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Check a schema and hand back a frozen, name-trimmed copy of it.
 *
 * Every path into the compatibility engine runs through here first, which is what makes the diff deterministic.
 * A schema carrying the same name twice has no single answer to *what type is `learnerId`*, and a diff computed
 * against it depends on which of the two declarations the implementation happened to keep — so the duplicate is
 * refused rather than resolved. {@link DuplicateSchemaFieldError} exists precisely because the two declarations
 * usually disagree, and quietly keeping one of them makes the engine's verdict an accident.
 *
 * Duplicate detection is exact rather than case-insensitive. `learnerId` and `learnerid` are two different
 * properties of a JSON payload, and refusing them as a collision would refuse a schema that is merely ugly.
 *
 * @throws {EmptySchemaError} when the schema declares nothing, and so validates everything.
 * @throws {TooManySchemaFieldsError} beyond {@link MAX_SCHEMA_FIELDS}, where it stops being an event.
 * @throws {DuplicateSchemaFieldError} when one name is declared twice.
 * @throws {InvalidSchemaFieldNameError} when a name could not be a payload property.
 */
export function validateSchemaFields(
  eventTypeKey: string,
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  if (fields.length === 0) {
    throw new EmptySchemaError(eventTypeKey);
  }
  if (fields.length > MAX_SCHEMA_FIELDS) {
    throw new TooManySchemaFieldsError(eventTypeKey, fields.length, MAX_SCHEMA_FIELDS);
  }

  const seen = new Set<string>();
  const validated: SchemaField[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (name.length > MAX_KEY_LENGTH || !FIELD_NAME_PATTERN.test(name)) {
      throw new InvalidSchemaFieldNameError(eventTypeKey, field.name);
    }
    if (seen.has(name)) {
      throw new DuplicateSchemaFieldError(eventTypeKey, name);
    }
    seen.add(name);
    validated.push(Object.freeze({ name, type: field.type, required: field.required }));
  }
  return Object.freeze(validated);
}

// --- Difference ------------------------------------------------------------------

/** Code-point ordering, so that a diff reads the same on every machine regardless of its locale. */
const compareText = (left: string, right: string): number => {
  if (left < right) return -1;
  return left > right ? 1 : 0;
};

/** One difference, with the sentence an operator reads when it is the reason something was refused. */
const change = (
  kind: SchemaChangeKind,
  field: SchemaChange["field"],
  from: SchemaChange["from"],
  to: SchemaChange["to"],
  description: string,
): SchemaChange => Object.freeze({ kind, field, from, to, description });

/**
 * Every difference between a schema and the version standing before it, in field-name order.
 *
 * Ordered by name rather than by declaration order because the two schemas may declare their fields in
 * different orders while meaning the same thing, and a diff whose order depends on that is a diff that reads
 * differently on every re-run. One field can produce two entries — a field that both changed type and became
 * required is two separate things that broke, and reporting them as one would hide whichever the author did not
 * intend.
 *
 * This is deliberately mode-blind. It is the same list whether the event type promised `full` or `none`, which
 * is what lets a registry show an author what they altered even in the act of refusing it, and lets a
 * `none`-mode type still be reviewed by somebody who wants to know what changed.
 */
export function describeSchemaChanges(
  eventTypeKey: string,
  previous: readonly SchemaField[],
  next: readonly SchemaField[],
): readonly SchemaChange[] {
  const before = new Map(validateSchemaFields(eventTypeKey, previous).map((f) => [f.name, f]));
  const after = new Map(validateSchemaFields(eventTypeKey, next).map((f) => [f.name, f]));
  const names = [...new Set([...before.keys(), ...after.keys()])].sort(compareText);

  const changes: SchemaChange[] = [];
  for (const name of names) {
    const was = before.get(name);
    const now = after.get(name);

    if (was !== undefined && now !== undefined) {
      if (was.type !== now.type) {
        const sentence = `changed the type of "${name}" from "${was.type}" to "${now.type}"`;
        changes.push(change("retyped", name, was.type, now.type, sentence));
      }
      if (was.required !== now.required) {
        const kind: SchemaChangeKind = now.required ? "tightened" : "loosened";
        const sentence = now.required
          ? `made the optional field "${name}" required`
          : `made the required field "${name}" optional`;
        changes.push(change(kind, name, was.type, now.type, sentence));
      }
    } else if (was !== undefined) {
      const kind: SchemaChangeKind = was.required ? "removed_required" : "removed_optional";
      const sentence = `removed the ${was.required ? "required" : "optional"} field "${name}"`;
      changes.push(change(kind, name, was.type, null, sentence));
    } else if (now !== undefined) {
      const kind: SchemaChangeKind = now.required ? "added_required" : "added_optional";
      const sentence = `added the ${now.required ? "required" : "optional"} field "${name}"`;
      changes.push(change(kind, name, null, now.type, sentence));
    }
  }
  return Object.freeze(changes);
}

// --- Assessment ------------------------------------------------------------------

/** Refused under `backward`: a new reader cannot find a field it requires in a year of old payloads. */
const BACKWARD_BREAKING = Object.freeze(["added_required", "retyped", "tightened"] as const);

/** Refused under `forward`: an old reader stops finding a field it requires the moment the new shape ships. */
const FORWARD_BREAKING = Object.freeze(["loosened", "removed_required", "retyped"] as const);

/**
 * Refused under `full`, computed rather than restated.
 *
 * `full` claims to be both promises at once, and writing its list out by hand would make that claim something
 * the next person has to keep true. Deriving it means a change to either direction is a change to `full`,
 * automatically and by construction.
 */
const FULL_BREAKING: readonly SchemaChangeKind[] = Object.freeze(
  [...new Set<SchemaChangeKind>([...BACKWARD_BREAKING, ...FORWARD_BREAKING])].sort(compareText),
);

/** Refused under `none`: nothing, which is the entire meaning of choosing it. */
const NONE_BREAKING: readonly SchemaChangeKind[] = Object.freeze([]);

/**
 * Which kinds of difference the declared mode forbids.
 *
 * Exposed rather than kept private because it is the answer to a question an integrator asks before they make a
 * change rather than after it is refused — *what am I allowed to do to this event type?* — and a registry that
 * can only answer by refusing something teaches its users to set the mode to `none`.
 */
export function breakingChangeKinds(mode: CompatibilityMode): readonly SchemaChangeKind[] {
  switch (mode) {
    case "backward":
      return BACKWARD_BREAKING;
    case "forward":
      return FORWARD_BREAKING;
    case "full":
      return FULL_BREAKING;
    case "none":
      return NONE_BREAKING;
  }
}

/**
 * Read a proposed schema against its predecessor under the mode the event type promised.
 *
 * The verdict carries both the full diff and the subset the mode forbids, because those answer two different
 * questions and a caller usually needs both at once: *what did I change* and *which part of it may I not*. A
 * refusal built from `breakingChanges` names the specific fields, which is the difference between a message
 * somebody acts on and one they argue with — "incompatible" invites a request for an override, while "removed
 * the required field `learnerId`, which every consumer of version 3 reads" does not.
 *
 * The engine does not raise on incompatibility. It returns a verdict, and the aggregate that owns the version
 * being registered raises `SchemaIncompatibleError` with these strings in its details. That split is the house
 * rule for engines and it earns its keep here: the same assessment runs in a preview endpoint that must not
 * throw and in a registration that must.
 *
 * A first version has no predecessor and is not assessed at all; `previous` is never empty, and an empty one is
 * refused as {@link EmptySchemaError} rather than treated as *no constraints*.
 */
export function assessCompatibility(request: CompatibilityRequest): CompatibilityVerdict {
  const changes = describeSchemaChanges(request.eventTypeKey, request.previous, request.next);
  const forbidden = breakingChangeKinds(request.mode);
  const breakingChanges = changes
    .filter((entry) => forbidden.includes(entry.kind))
    .map((entry) => entry.description);

  return Object.freeze({
    mode: request.mode,
    compatible: breakingChanges.length === 0,
    changes,
    breakingChanges: Object.freeze(breakingChanges),
  });
}
