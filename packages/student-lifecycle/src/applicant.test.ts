import type { TenantId, Uuid } from "@knowget/types";
import {
  addRequiredDocument,
  type Applicant,
  approveApplication,
  beginReview,
  isApproved,
  recordInterviewOutcome,
  rejectApplication,
  scheduleInterview,
  setDocumentStatus,
  startApplication,
  submitApplication,
  withdrawApplication,
} from "./applicant";
import { describe, expect, it } from "vitest";
import {
  DocumentNotFoundError,
  EmptyDocumentTypeError,
  InvalidApplicantTransitionError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (): Applicant =>
  startApplication({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    requiredDocuments: ["birth_certificate", "birth_certificate", "transcript"],
  });

describe("applicant", () => {
  it("starts a draft with a deduped document checklist", () => {
    const a = make();
    expect(a.status).toBe("draft");
    expect(a.documents.map((d) => d.type)).toEqual(["birth_certificate", "transcript"]);
    expect(a.documents.every((d) => d.status === "required")).toBe(true);
  });

  it("manages the document checklist", () => {
    const a = setDocumentStatus(addRequiredDocument(make(), "photo"), "transcript", "verified");
    expect(a.documents.find((d) => d.type === "photo")?.status).toBe("required");
    expect(a.documents.find((d) => d.type === "transcript")?.status).toBe("verified");
    expect(() => addRequiredDocument(a, "  ")).toThrow(EmptyDocumentTypeError);
    expect(() => setDocumentStatus(a, "unknown", "received")).toThrow(DocumentNotFoundError);
  });

  it("runs the evaluation lifecycle to an approval", () => {
    const submitted = submitApplication(make());
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedOn).not.toBeNull();

    const interviewing = scheduleInterview(beginReview(submitted), { scheduledOn: "2030-02-01" });
    expect(interviewing.status).toBe("interview_scheduled");
    expect(interviewing.interview?.scheduledOn).toBe("2030-02-01");

    const reviewed = recordInterviewOutcome(interviewing, "Strong candidate");
    expect(reviewed.status).toBe("under_review");
    expect(reviewed.interview?.outcome).toBe("Strong candidate");

    const approved = approveApplication(reviewed, { note: "Offer extended" });
    expect(approved.status).toBe("approved");
    expect(approved.decision?.outcome).toBe("approved");
    expect(isApproved(approved)).toBe(true);
  });

  it("rejects and withdraws, and guards illegal transitions", () => {
    expect(rejectApplication(submitApplication(make())).status).toBe("rejected");
    expect(withdrawApplication(make()).status).toBe("withdrawn");
    expect(() => beginReview(make())).toThrow(InvalidApplicantTransitionError);
    expect(() => submitApplication(withdrawApplication(make()))).toThrow(
      InvalidApplicantTransitionError,
    );
  });
});
