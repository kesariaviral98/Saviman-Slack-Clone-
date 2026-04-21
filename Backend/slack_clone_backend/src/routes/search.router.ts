// ─────────────────────────────────────────────────────────────────────────────
// Search Router
//   GET /search?q=&workspaceId=&channelId=&limit=
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { SearchQuerySchema } from '../shared';
import { searchService } from '../services/search.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireWorkspaceMember } from '../middleware/rbac.middleware';
import { searchRateLimit } from '../middleware/rateLimit.middleware';

export const searchRouter = Router();

// ── GET /search ───────────────────────────────────────────────────────────────

searchRouter.get(
  '/',
  authenticate,
  searchRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = SearchQuerySchema.parse(req.query);

      // Verify user is a workspace member (results are already filtered per-channel,
      // but this check prevents probing workspace existence)
      const wsGuard = requireWorkspaceMember(() => query.workspaceId);
      await new Promise<void>((resolve, reject) => {
        wsGuard(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
      });

      const results = await searchService.search({
        query: query.q,
        workspaceId: query.workspaceId,
        userId: req.user!.id,
        channelId: query.channelId,
        limit: query.limit,
      });

      res.json({
        success: true,
        data: { results },
        meta: { query: query.q, count: results.length },
      });
    } catch (err) {
      next(err);
    }
  },
);
