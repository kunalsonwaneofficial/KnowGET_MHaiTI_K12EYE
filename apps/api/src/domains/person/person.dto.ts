import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const gender = z.enum(["male", "female", "other", "unspecified"]);

const nameSchema = z.object({
  given: z.string().min(1).max(100),
  family: z.string().min(1).max(100),
  middle: z.string().max(100).optional(),
  preferred: z.string().max(100).optional(),
});

export const registerPersonSchema = z.object({
  name: nameSchema,
  dateOfBirth: isoDate.optional(),
  gender: gender.optional(),
  allowDuplicate: z.boolean().optional(),
});

export const renamePersonSchema = z.object({ name: nameSchema });

export const setDemographicsSchema = z.object({
  dateOfBirth: isoDate.nullable().optional(),
  gender: gender.optional(),
});

export const addContactSchema = z.object({
  type: z.enum(["email", "phone", "address"]),
  value: z.string().min(1).max(320),
  label: z.string().max(100).optional(),
});

export const changeStatusSchema = z.object({
  // `merged` is set only by the merge operation; not a transition target.
  status: z.enum(["active", "inactive", "deceased", "archived"]),
});

export const mergePersonSchema = z.object({ mergedId: z.string().uuid() });

export type RegisterPersonDto = z.infer<typeof registerPersonSchema>;
export type RenamePersonDto = z.infer<typeof renamePersonSchema>;
export type SetDemographicsDto = z.infer<typeof setDemographicsSchema>;
export type AddContactDto = z.infer<typeof addContactSchema>;
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
export type MergePersonDto = z.infer<typeof mergePersonSchema>;
