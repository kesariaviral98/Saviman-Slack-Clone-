import { z } from 'zod';

export const BanUserSchema = z.object({
  reason: z.string().min(1).max(500).trim().optional(),
});
export type BanUserInput = z.infer<typeof BanUserSchema>;
