import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200, 'Query too long').trim(),
  workspaceId: z.string().uuid('Invalid workspace ID'),
  channelId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
