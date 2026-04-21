import { z } from 'zod';

export const SendMessageSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10_000, 'Message cannot exceed 10,000 characters')
    .trim(),
  parentId: z.string().uuid().optional(),
  clientTempId: z.string().uuid('Invalid temp ID'),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const EditMessageSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10_000, 'Message cannot exceed 10,000 characters')
    .trim(),
});
export type EditMessageInput = z.infer<typeof EditMessageSchema>;

export const DeleteMessageSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
});
export type DeleteMessageInput = z.infer<typeof DeleteMessageSchema>;

export const ReactionSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  emoji: z.string().min(1).max(20, 'Emoji string too long'),
});
export type ReactionInput = z.infer<typeof ReactionSchema>;

export const GetMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;

export const ChannelSyncSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  lastSeenSequence: z.number().int().nonnegative(),
});
export type ChannelSyncInput = z.infer<typeof ChannelSyncSchema>;

export const TypingSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
});
export type TypingInput = z.infer<typeof TypingSchema>;
