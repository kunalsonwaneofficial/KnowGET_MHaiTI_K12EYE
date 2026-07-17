import { z } from "zod";

const organizationType = z.enum([
  "trust",
  "society",
  "school",
  "campus",
  "department",
  "grade",
  "section",
]);

export const createOrganizationSchema = z.object({
  type: organizationType,
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(64),
  parentId: z.string().uuid().optional(),
});

export const renameOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});

export const moveOrganizationSchema = z.object({
  parentId: z.string().uuid().nullable(),
});

export const setStatusSchema = z.object({
  // `draft` is the creation state only; it is not a transition target.
  status: z.enum(["active", "suspended", "archived"]),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
export type RenameOrganizationDto = z.infer<typeof renameOrganizationSchema>;
export type MoveOrganizationDto = z.infer<typeof moveOrganizationSchema>;
export type SetStatusDto = z.infer<typeof setStatusSchema>;
