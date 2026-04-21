import { z } from 'zod';

export const CreateChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(80, 'Channel name cannot exceed 80 characters')
    .regex(/^[a-z0-9-_]+$/, 'Channel name may only contain lowercase letters, numbers, hyphens, and underscores')
    .trim(),
  isPrivate: z.boolean().default(false),
  type: z.enum(['text', 'voice', 'announcement']).default('text'),
  /** UUIDs of workspace members to invite when creating a private channel. */
  memberIds: z.array(z.string().uuid()).optional(),
});
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;

export const UpdateChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-_]+$/)
    .trim()
    .optional(),
  isPrivate: z.boolean().optional(),
});
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;

export const AddChannelMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});
export type AddChannelMemberInput = z.infer<typeof AddChannelMemberSchema>;
