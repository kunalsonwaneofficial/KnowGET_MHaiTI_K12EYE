import { randomUUID } from "node:crypto";
import type { CorrelationId, Uuid } from "@knowget/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate a new random (v4) UUID. */
export const newUuid = (): Uuid => randomUUID() as Uuid;

/** Generate a new correlation id for tracing a logical operation. */
export const newCorrelationId = (): CorrelationId => randomUUID() as CorrelationId;

/** Validate that a string is a well-formed UUID. */
export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
