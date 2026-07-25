/** The kind of leave a request represents. */
export const LEAVE_TYPES = [
  "student",
  "staff",
  "medical",
  "emergency",
  "approved_absence",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Lifecycle of a leave request: requested → approved | rejected | cancelled. */
export const LEAVE_STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** A reference to a document supporting a leave request (name + retrievable location). */
export interface SupportingDocument {
  readonly name: string;
  readonly url: string;
}

/** Narrow an arbitrary string to a {@link LeaveType}. */
export const isLeaveType = (value: string): value is LeaveType =>
  (LEAVE_TYPES as readonly string[]).includes(value);
