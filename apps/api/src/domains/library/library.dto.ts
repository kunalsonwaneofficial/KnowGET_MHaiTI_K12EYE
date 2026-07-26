import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const intField = z.number().int();
const count = z.number().int().nonnegative();

const titleType = z.enum(["book", "journal", "magazine", "reference", "media", "thesis"]);
const copyCondition = z.enum(["new", "good", "fair", "poor"]);
const digitalFormat = z.enum(["ebook", "audiobook", "video", "ejournal", "courseware", "dataset"]);
const accessModel = z.enum(["open", "licensed", "subscription"]);
const memberCategory = z.enum(["student", "faculty", "staff", "alumni", "guest"]);

// --- Title -----------------------------------------------------------------------
export const catalogTitleSchema = z.object({
  organizationId: uuid,
  title: nonEmpty,
  type: titleType,
  isbn: nullableText.optional(),
  authors: z.array(nonEmpty).optional(),
  subjects: z.array(nonEmpty).optional(),
  language: nullableText.optional(),
  publisher: nullableText.optional(),
  publicationYear: intField.nullable().optional(),
});
export const renameTitleSchema = z.object({ title: nonEmpty });
export const setAuthorsSchema = z.object({ authors: z.array(nonEmpty) });
export const setSubjectsSchema = z.object({ subjects: z.array(nonEmpty) });
export const setTitleMetadataSchema = z.object({
  isbn: nullableText.optional(),
  language: nullableText.optional(),
  publisher: nullableText.optional(),
  publicationYear: intField.nullable().optional(),
});

// --- Copy ------------------------------------------------------------------------
export const accessionCopySchema = z.object({
  titleId: uuid,
  barcode: nonEmpty,
  condition: copyCondition.optional(),
  location: nullableText.optional(),
  acquiredOn: nullableText.optional(),
});
export const setCopyLocationSchema = z.object({ location: nullableText });
export const setCopyConditionSchema = z.object({ condition: copyCondition });

// --- Digital asset ---------------------------------------------------------------
export const catalogDigitalAssetSchema = z.object({
  organizationId: uuid,
  title: nonEmpty,
  format: digitalFormat,
  accessModel,
  accessUrl: nullableText.optional(),
  provider: nullableText.optional(),
  licenseExpiry: nullableText.optional(),
});
export const renameDigitalAssetSchema = z.object({ title: nonEmpty });
export const setDigitalAccessSchema = z.object({
  accessModel,
  accessUrl: nullableText,
  provider: nullableText,
});
export const renewLicenseSchema = z.object({ licenseExpiry: nullableText });

// --- Library member --------------------------------------------------------------
export const registerMemberSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  membershipNumber: nonEmpty,
  category: memberCategory,
  joinedOn: nonEmpty,
  expiresOn: nullableText.optional(),
});
export const setMemberCategorySchema = z.object({ category: memberCategory });
export const setMemberExpirySchema = z.object({ expiresOn: nullableText });

// --- Loan ------------------------------------------------------------------------
// Terms (loan period, renewal + borrowing limits) are NOT client-supplied: the controller resolves them
// from the member's organization active circulation policy. The client names only what to lend to whom.
export const issueLoanSchema = z.object({
  copyId: uuid,
  memberId: uuid,
  issueDate: nonEmpty,
});
export const returnLoanSchema = z.object({ returnedDate: nonEmpty.optional() });

// --- Reservation -----------------------------------------------------------------
export const placeReservationSchema = z.object({
  titleId: uuid,
  memberId: uuid,
  requestedOn: nonEmpty,
});
export const markReservationReadySchema = z.object({ readyOn: nonEmpty, expiresOn: nonEmpty });

// --- Circulation policy ----------------------------------------------------------
const defaultRule = z.object({
  loanPeriodDays: count,
  borrowingLimit: count,
  renewalLimit: count,
  holdShelfDays: count,
});
const categoryRule = defaultRule.extend({ category: memberCategory });
export const draftPolicySchema = z.object({
  organizationId: uuid,
  name: nonEmpty,
  defaultRule,
  rules: z.array(categoryRule).optional(),
});
export const setPolicyRulesSchema = z.object({ rules: z.array(categoryRule) });
export const setPolicyDefaultRuleSchema = z.object({ defaultRule });

// --- Collection profile ----------------------------------------------------------
export const refreshCollectionSchema = z.object({ organizationId: uuid, asOfDate: nonEmpty });
