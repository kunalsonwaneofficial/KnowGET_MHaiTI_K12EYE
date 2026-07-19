/** The state of a required admission document on an application's checklist. */
export type DocumentStatus = "required" | "received" | "verified" | "waived";

/** An item on an application's document checklist (e.g. birth certificate, transcript). */
export interface ApplicationDocument {
  readonly type: string;
  readonly status: DocumentStatus;
}
