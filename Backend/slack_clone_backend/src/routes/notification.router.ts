// ─────────────────────────────────────────────────────────────────────────────
// Notification Router
//   GET   /notifications?limit=20              — list notifications
//   GET   /notifications/unread-count          — fast unread count (Redis-backed)
//   PATCH /notifications/:id/read              — mark one as read
//   PATCH /notifications/read-all              — mark all as read
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { notificationService } from '../services/notification.service';
import { authenticate } from '../middleware/auth.middleware';

export const notificationRouter = Router();

// ── GET /notifications/unread-count ──────────────────────────────────────────
// Must be before /:id to avoid being shadowed

notificationRouter.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await notificationService.getUnreadCount(req.user!.id);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /notifications/read-all ─────────────────────────────────────────────

notificationRouter.patch(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { count } = await notificationService.markAllRead(req.user!.id);
      res.json({ success: true, data: { markedRead: count } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /notifications ────────────────────────────────────────────────────────

notificationRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          before: z.string().uuid().optional(),
        })
        .parse(req.query);

      const result = await notificationService.getNotifications(req.user!.id, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /notifications/:id/read ─────────────────────────────────────────────

notificationRouter.patch(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await notificationService.markRead(
        req.params['id'] ?? '',
        req.user!.id,
      );
      res.json({ success: true, data: { notification } });
    } catch (err) {
      next(err);
    }
  },
);
