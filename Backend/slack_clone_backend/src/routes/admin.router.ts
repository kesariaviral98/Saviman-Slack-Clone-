// ─────────────────────────────────────────────────────────────────────────────
// Admin Router — all routes require platform-admin access.
//   GET    /admin/stats
//   GET    /admin/workspaces?page=&limit=
//   GET    /admin/users?page=&limit=
//   DELETE /admin/messages/:id
//   PATCH  /admin/users/:id/ban
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { BanUserSchema } from '../shared';
import { adminService } from '../services/admin.service';
import { authenticate } from '../middleware/auth.middleware';
import { requirePlatformAdmin } from '../middleware/rbac.middleware';

export const adminRouter = Router();

// All admin routes require authentication + platform admin flag
adminRouter.use(authenticate, requirePlatformAdmin);

// ── GET /admin/stats ──────────────────────────────────────────────────────────

adminRouter.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await adminService.getStats();
      res.json({ success: true, data: { stats } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /admin/workspaces ─────────────────────────────────────────────────────

adminRouter.get(
  '/workspaces',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      const result = await adminService.listWorkspaces(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /admin/users ──────────────────────────────────────────────────────────

adminRouter.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      const result = await adminService.listUsers(query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /admin/messages/:id ────────────────────────────────────────────────

adminRouter.delete(
  '/messages/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await adminService.deleteMessage(req.params['id'] ?? '');
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /admin/users/:id/ban ────────────────────────────────────────────────

adminRouter.patch(
  '/users/:id/ban',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = BanUserSchema.parse(req.body);
      await adminService.banUser(req.params['id'] ?? '', body.reason);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);
