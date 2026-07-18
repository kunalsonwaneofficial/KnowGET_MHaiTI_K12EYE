import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const kind = z.enum(["guardian", "parent", "sibling", "spouse", "emergency_contact", "other"]);

export const relateSchema = z.object({
  fromPersonId: z.string().uuid(),
  toPersonId: z.string().uuid(),
  kind,
  startDate: isoDate.optional(),
});

export const endRelationshipSchema = z.object({ endDate: isoDate.optional() });

export type RelateDto = z.infer<typeof relateSchema>;
export type EndRelationshipDto = z.infer<typeof endRelationshipSchema>;
