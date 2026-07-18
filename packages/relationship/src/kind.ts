/**
 * The kinds of association a relationship can represent. A relationship is a
 * directed edge `from → to`; each kind fixes what each side *is*. Symmetric kinds
 * (sibling, spouse) mean the same thing in both directions; directed kinds
 * (guardian, parent, emergency contact) do not.
 */
export type RelationshipKind =
  "guardian" | "parent" | "sibling" | "spouse" | "emergency_contact" | "other";

export const RELATIONSHIP_KINDS: readonly RelationshipKind[] = [
  "guardian",
  "parent",
  "sibling",
  "spouse",
  "emergency_contact",
  "other",
];

interface KindMeta {
  /** True when the edge means the same thing in both directions. */
  readonly symmetric: boolean;
  /** What the `from` person is to the `to` person. */
  readonly fromRole: string;
  /** What the `to` person is to the `from` person. */
  readonly toRole: string;
}

const KIND_META: Readonly<Record<RelationshipKind, KindMeta>> = {
  guardian: { symmetric: false, fromRole: "guardian", toRole: "dependent" },
  parent: { symmetric: false, fromRole: "parent", toRole: "child" },
  sibling: { symmetric: true, fromRole: "sibling", toRole: "sibling" },
  spouse: { symmetric: true, fromRole: "spouse", toRole: "spouse" },
  emergency_contact: {
    symmetric: false,
    fromRole: "emergency contact",
    toRole: "protected person",
  },
  other: { symmetric: false, fromRole: "related", toRole: "related" },
};

/** True when a relationship kind is symmetric (direction carries no meaning). */
export const isSymmetricKind = (kind: RelationshipKind): boolean => KIND_META[kind].symmetric;

/** The role the `from` person plays (e.g. `guardian`). */
export const fromRole = (kind: RelationshipKind): string => KIND_META[kind].fromRole;

/** The role the `to` person plays (e.g. `dependent`). */
export const toRole = (kind: RelationshipKind): string => KIND_META[kind].toRole;
