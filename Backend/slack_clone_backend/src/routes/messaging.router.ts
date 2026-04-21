// ─────────────────────────────────────────────────────────────────────────────
// Messaging Router (REST only — creation is socket-only per spec)
//   GET    /channels/:id/messages?before=&limit=  — paginated messages
//   GET    /messages/:id/thread                   — get thread
//   PATCH  /messages/:id                          — edit message (owner)
//   DELETE /messages/:id                          — delete message (owner/admin)
//   POST   /messages/:messageId/reactions         — add reaction
//   DELETE /messages/:messageId/reactions/:emoji  — remove reaction
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { GetMessagesQuerySchema, EditMessageSchema } from '../shared';
import { messagingService } from '../services/messaging.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireChannelMember } from '../middleware/rbac.middleware';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../utils/prisma';

export const messagingRouter = Router();

// ── GET /channels/:id/messages ────────────────────────────────────────────────

messagingRouter.get(
  '/channels/:id/messages',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = GetMessagesQuerySchema.parse(req.query);
      const result = await messagingService.getMessages(req.params['id'] ?? '', {
        before: query.before,
        limit: query.limit,
      });
      res.json({
        success: true,
        data: result,
        meta: { channelId: req.params['id'] },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /messages/:id/thread ──────────────────────────────────────────────────

messagingRouter.get(
  '/messages/:id/thread',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify user can access the channel this message belongs to
      const msg = await prisma.message.findUnique({
        where: { id: req.params['id'] ?? '' },
        select: { channelId: true },
      });
      if (!msg) throw new AppError(404, 'Message not found');

      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: msg.channelId, userId: req.user!.id } },
      });
      if (!member) throw new AppError(403, 'You are not a member of this channel');

      const thread = await messagingService.getThread(req.params['id'] ?? '');
      res.json({ success: true, data: thread });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /messages/:id ───────────────────────────────────────────────────────

messagingRouter.patch(
  '/messages/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = EditMessageSchema.parse({ ...req.body, messageId: req.params['id'] });
      const message = await messagingService.editMessage(
        req.params['id'] ?? '',
        req.user!.id,
        body.content,
      );
      res.json({ success: true, data: { message } });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /messages/:id ──────────────────────────────────────────────────────

messagingRouter.delete(
  '/messages/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { channelId } = await messagingService.deleteMessage(
        req.params['id'] ?? '',
        req.user!.id,
        req.workspaceRole,
      );
      res.json({ success: true, data: { channelId } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /messages/:messageId/reactions ───────────────────────────────────────

messagingRouter.post(
  '/messages/:messageId/reactions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { emoji } = z
        .object({ emoji: z.string().min(1).max(20) })
        .parse(req.body);

      // Verify user is a member of the channel this message belongs to
      const msg = await prisma.message.findUnique({
        where: { id: req.params['messageId'] ?? '' },
        select: { channelId: true },
      });
      if (!msg) throw new AppError(404, 'Message not found');
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: msg.channelId, userId: req.user!.id } },
      });
      if (!member) throw new AppError(403, 'You are not a member of this channel');

      const reactions = await messagingService.addReaction(
        req.params['messageId'] ?? '',
        req.user!.id,
        emoji,
      );
      res.json({ success: true, data: { reactions } });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /messages/:messageId/reactions/:emoji ──────────────────────────────

messagingRouter.delete(
  '/messages/:messageId/reactions/:emoji',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const emoji = decodeURIComponent(req.params['emoji'] ?? '');
      const reactions = await messagingService.removeReaction(
        req.params['messageId'] ?? '',
        req.user!.id,
        emoji,
      );
      res.json({ success: true, data: { reactions } });
    } catch (err) {
      next(err);
    }
  },
);
