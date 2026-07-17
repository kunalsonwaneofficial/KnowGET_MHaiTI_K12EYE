import type { ISODateString } from "@knowget/types";

/** Current instant as an ISO-8601 UTC string. */
export const nowIso = (): ISODateString => new Date().toISOString() as ISODateString;

/** Convert a `Date` to an ISO-8601 UTC string. */
export const toIso = (date: Date): ISODateString => date.toISOString() as ISODateString;

/** Parse an ISO-8601 string into a `Date`. */
export const parseIso = (value: ISODateString): Date => new Date(value);

/** True when the given ISO string represents a valid date. */
export const isValidIso = (value: string): boolean => !Number.isNaN(Date.parse(value));
