/** Dependency-injection tokens for Event Mesh, Streaming & Messaging (P3-D02). */

// Repositories (Prisma/RLS adapters over the mesh ports).
export const EM_EVENT_TYPE_REPOSITORY = Symbol("EM_EVENT_TYPE_REPOSITORY");
export const EM_STREAM_REPOSITORY = Symbol("EM_STREAM_REPOSITORY");
export const EM_BINDING_REPOSITORY = Symbol("EM_BINDING_REPOSITORY");
export const EM_SUBSCRIPTION_REPOSITORY = Symbol("EM_SUBSCRIPTION_REPOSITORY");
export const EM_MESSAGE_REPOSITORY = Symbol("EM_MESSAGE_REPOSITORY");
export const EM_CHECKPOINT_REPOSITORY = Symbol("EM_CHECKPOINT_REPOSITORY");
export const EM_DEAD_LETTER_REPOSITORY = Symbol("EM_DEAD_LETTER_REPOSITORY");
export const EM_REPLAY_REPOSITORY = Symbol("EM_REPLAY_REPOSITORY");

// Cross-domain read ports. Organization and person are the usual node checks (P2-D01-M01, P2-D03): every event
// type, stream, binding and subscription hangs off an institution, and every activation, publication, reset and
// discard is attributed to somebody who has to still exist when the record is read back. The transport registry
// is declared at this composition root rather than read from a table, for the same reason the gateway's adapter
// manifest is: a backbone is served because code was written that speaks to it, and a row an operator can type
// is a way of promising a backbone by accident.
export const EM_ORGANIZATION_DIRECTORY = Symbol("EM_ORGANIZATION_DIRECTORY");
export const EM_PERSON_DIRECTORY = Symbol("EM_PERSON_DIRECTORY");
export const EM_TRANSPORT_REGISTRY = Symbol("EM_TRANSPORT_REGISTRY");

// Application services.
export const EM_EVENT_TYPE_SERVICE = Symbol("EM_EVENT_TYPE_SERVICE");
export const EM_STREAM_SERVICE = Symbol("EM_STREAM_SERVICE");
export const EM_BINDING_SERVICE = Symbol("EM_BINDING_SERVICE");
export const EM_SUBSCRIPTION_SERVICE = Symbol("EM_SUBSCRIPTION_SERVICE");
export const EM_MESSAGE_SERVICE = Symbol("EM_MESSAGE_SERVICE");
export const EM_CHECKPOINT_SERVICE = Symbol("EM_CHECKPOINT_SERVICE");
export const EM_DEAD_LETTER_SERVICE = Symbol("EM_DEAD_LETTER_SERVICE");
export const EM_REPLAY_SERVICE = Symbol("EM_REPLAY_SERVICE");
