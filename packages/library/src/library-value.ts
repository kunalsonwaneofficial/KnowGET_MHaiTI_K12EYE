/** The kind of bibliographic title in the catalog. */
export const TITLE_TYPES = ["book", "journal", "magazine", "reference", "media", "thesis"] as const;

export type TitleType = (typeof TITLE_TYPES)[number];

/** Lifecycle of a catalog title — active (in the collection) or withdrawn (terminal). */
export const TITLE_STATUSES = ["active", "withdrawn"] as const;

export type TitleStatus = (typeof TITLE_STATUSES)[number];

/** The physical condition of a copy. */
export const COPY_CONDITIONS = ["new", "good", "fair", "poor"] as const;

export type CopyCondition = (typeof COPY_CONDITIONS)[number];

/**
 * Lifecycle of a physical copy: `available` ↔ `on_loan` (issued/returned), or → `lost` / `withdrawn`
 * (terminal). Only an `available` copy can be loaned.
 */
export const COPY_STATUSES = ["available", "on_loan", "lost", "withdrawn"] as const;

export type CopyStatus = (typeof COPY_STATUSES)[number];

/** The copy statuses from which a copy can be issued on loan. */
export const LOANABLE_COPY_STATUSES: readonly CopyStatus[] = ["available"];

/** The format of a digital learning asset. */
export const DIGITAL_FORMATS = [
  "ebook",
  "audiobook",
  "video",
  "ejournal",
  "courseware",
  "dataset",
] as const;

export type DigitalFormat = (typeof DIGITAL_FORMATS)[number];

/** How a digital asset is accessed — freely open, individually licensed, or subscription-based. */
export const ACCESS_MODELS = ["open", "licensed", "subscription"] as const;

export type AccessModel = (typeof ACCESS_MODELS)[number];

/** Lifecycle of a digital asset — active (accessible) or retired (terminal). */
export const DIGITAL_STATUSES = ["active", "retired"] as const;

export type DigitalStatus = (typeof DIGITAL_STATUSES)[number];

/** The category of a library member, driving borrowing privileges via the circulation policy. */
export const MEMBER_CATEGORIES = ["student", "faculty", "staff", "alumni", "guest"] as const;

export type MemberCategory = (typeof MEMBER_CATEGORIES)[number];

/** Lifecycle of a library member — active ↔ suspended → expired (terminal). */
export const MEMBER_STATUSES = ["active", "suspended", "expired"] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Lifecycle of a loan: `active` (out) → `returned`, or → `lost` (the borrower lost the copy). Overdue is
 * **derived** from the due date, never a stored status.
 */
export const LOAN_STATUSES = ["active", "returned", "lost"] as const;

export type LoanStatus = (typeof LOAN_STATUSES)[number];

/**
 * Lifecycle of a reservation (a hold on a title): `requested` (queued) → `ready` (a copy is free, the
 * member is notified) → `fulfilled` (checked out), or → `cancelled` / `expired` (the hold shelf life
 * lapsed).
 */
export const RESERVATION_STATUSES = [
  "requested",
  "ready",
  "fulfilled",
  "cancelled",
  "expired",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** The reservation statuses that are still open — a member may hold only one open reservation per title. */
export const OPEN_RESERVATION_STATUSES: readonly ReservationStatus[] = ["requested", "ready"];

/**
 * Lifecycle of a circulation policy: `draft` (rules editable) → `active` (published, rules frozen,
 * applied) → `archived` (terminal, superseded).
 */
export const POLICY_STATUSES = ["draft", "active", "archived"] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];
