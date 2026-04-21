import { z } from 'zod';

export const PresenceStatusSchema = z.object({
  status: z.enum(['active', 'away', 'dnd']),
});
export type PresenceStatusInput = z.infer<typeof PresenceStatusSchema>;
