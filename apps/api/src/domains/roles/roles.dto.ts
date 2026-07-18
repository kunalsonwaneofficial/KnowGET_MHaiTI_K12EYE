import { z } from "zod";

const permission = z.string().min(1).max(128);
const roleName = z.string().min(1).max(64);

export const defineRoleSchema = z.object({
  name: roleName,
  description: z.string().max(500).optional(),
  permissions: z.array(permission).optional(),
  isSystem: z.boolean().optional(),
});

/** Replace the whole permission set (an empty set is allowed). */
export const setPermissionsSchema = z.object({ permissions: z.array(permission) });

/** Add or remove a non-empty list of permissions. */
export const permissionsListSchema = z.object({ permissions: z.array(permission).min(1) });

export const renameRoleSchema = z.object({ name: roleName });

export const describeRoleSchema = z.object({ description: z.string().max(500).nullable() });

export type DefineRoleDto = z.infer<typeof defineRoleSchema>;
export type SetPermissionsDto = z.infer<typeof setPermissionsSchema>;
export type PermissionsListDto = z.infer<typeof permissionsListSchema>;
export type RenameRoleDto = z.infer<typeof renameRoleSchema>;
export type DescribeRoleDto = z.infer<typeof describeRoleSchema>;
