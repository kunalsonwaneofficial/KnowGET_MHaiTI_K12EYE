import { z } from "zod";

const identifierType = z.enum(["username", "email", "mobile"]);

const identifierSchema = z.object({
  type: identifierType,
  value: z.string().min(1).max(320),
});

export const provisionAccountSchema = z.object({
  personId: z.string().uuid(),
  identifiers: z.array(identifierSchema).min(1),
  password: z.string().min(8).max(200).optional(),
  activate: z.boolean().optional(),
});

export const identifierBodySchema = identifierSchema;

export const setCredentialSchema = z.object({
  password: z.string().min(8).max(200),
});

export const lockAccountSchema = z.object({
  until: z.string().datetime(),
});

export type ProvisionAccountDto = z.infer<typeof provisionAccountSchema>;
export type IdentifierDto = z.infer<typeof identifierBodySchema>;
export type SetCredentialDto = z.infer<typeof setCredentialSchema>;
export type LockAccountDto = z.infer<typeof lockAccountSchema>;
