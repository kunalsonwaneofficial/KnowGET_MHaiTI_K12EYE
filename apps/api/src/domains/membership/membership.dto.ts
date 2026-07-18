import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const roles = z.array(z.string().min(1).max(64)).min(1);

export const grantMembershipSchema = z.object({
  personId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roles,
  startDate: isoDate.optional(),
});

export const changeRolesSchema = z.object({ roles });

export const endMembershipSchema = z.object({ endDate: isoDate.optional() });

export type GrantMembershipDto = z.infer<typeof grantMembershipSchema>;
export type ChangeRolesDto = z.infer<typeof changeRolesSchema>;
export type EndMembershipDto = z.infer<typeof endMembershipSchema>;
