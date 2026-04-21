import { z } from 'zod';

export const NotificationReadSchema = z.object({
  notificationId: z.string().uuid('Invalid notification ID'),
});
export type NotificationReadInput = z.infer<typeof NotificationReadSchema>;
