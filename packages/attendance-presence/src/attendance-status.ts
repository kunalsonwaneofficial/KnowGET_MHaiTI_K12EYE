/**
 * The attendance state of a participant in a session. The platform is provider-agnostic:
 * how a status was captured is recorded separately as an {@link AttendanceMethod}.
 */
export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused",
  "medical_leave",
  "official_duty",
  "remote",
  "partial",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * How an attendance record was collected. Open-ended so new collection methods
 * (biometric, RFID/NFC, facial) can be recorded without a domain-model change — the
 * platform stays provider-agnostic.
 */
export const ATTENDANCE_METHODS = [
  "manual",
  "bulk",
  "teacher_assisted",
  "device_assisted",
  "biometric",
  "rfid",
  "nfc",
  "facial",
  "other",
] as const;

export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

/** Narrow an arbitrary string to an {@link AttendanceStatus}. */
export const isAttendanceStatus = (value: string): value is AttendanceStatus =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value);

/** Narrow an arbitrary string to an {@link AttendanceMethod}. */
export const isAttendanceMethod = (value: string): value is AttendanceMethod =>
  (ATTENDANCE_METHODS as readonly string[]).includes(value);

/**
 * How a status contributes to an attendance calculation:
 * - `weight` — the numerator contribution when the session counts (present = 1,
 *   partial = 0.5, absent = 0).
 * - `counts` — whether the session is in the denominator at all. Excused, medical-leave
 *   and official-duty are excluded entirely (they neither help nor hurt attendance).
 * - `onTime` — whether an attended session was punctual (drives the punctuality metric).
 */
export interface StatusClassification {
  readonly weight: number;
  readonly counts: boolean;
  readonly onTime: boolean;
}

/** Classify an attendance status for the policy engine and presence intelligence. */
export function classifyStatus(status: AttendanceStatus): StatusClassification {
  switch (status) {
    case "present":
    case "remote":
      return { weight: 1, counts: true, onTime: true };
    case "late":
      return { weight: 1, counts: true, onTime: false };
    case "partial":
      return { weight: 0.5, counts: true, onTime: false };
    case "absent":
      return { weight: 0, counts: true, onTime: false };
    case "excused":
    case "medical_leave":
    case "official_duty":
      return { weight: 0, counts: false, onTime: false };
  }
}
