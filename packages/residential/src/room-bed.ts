import { DuplicateBedKeyError, EmptyBedKeyError, EmptyBedLabelError } from "./errors";

/**
 * A single bed in a {@link Room} — a named, individually-allocatable sleeping place. The `key` is a
 * stable identifier unique within the room (a bed allocation references its bed by key); the `label` is
 * the human-facing name (e.g. "A", "Upper-1"). A room's beds are its capacity: the number of beds bounds
 * how many students can be allocated. Beds are editable only while the room is a draft, then frozen.
 */
export interface Bed {
  readonly key: string;
  readonly label: string;
}

export interface BedInput {
  readonly key: string;
  readonly label: string;
}

/** Normalize and validate a bed input (non-empty key and label). */
export function makeBed(input: BedInput): Bed {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyBedKeyError();
  }
  const label = input.label.trim();
  if (label.length === 0) {
    throw new EmptyBedLabelError();
  }
  return { key, label };
}

/** Build a bed list from inputs, rejecting duplicate keys (order preserved). */
export function buildBeds(inputs: readonly BedInput[]): Bed[] {
  const seen = new Set<string>();
  const beds: Bed[] = [];
  for (const input of inputs) {
    const bed = makeBed(input);
    if (seen.has(bed.key)) {
      throw new DuplicateBedKeyError(bed.key);
    }
    seen.add(bed.key);
    beds.push(bed);
  }
  return beds;
}
