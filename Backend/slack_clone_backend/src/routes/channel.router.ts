// ─────────────────────────────────────────────────────────────────────────────
// Channel Router
//   GET    /workspaces/:wid/channels             — list channels
//   POST   /workspaces/:wid/channels             — create channel
//   POST   /workspaces/:wid/dm                   — open/create DM
//   GET    /channels/:id                         — get channel details
//   PATCH  /channels/:id                         — update channel (admin)
//   DELETE /channels/:id                         — delete channel (admin)
//   GET    /channels/:id/members                 — list channel members
//   POST   /channels/:id/members                 — add member (admin)
//   DELETE /channels/:id/members/:userId         — remove member (admin)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { CreateChannelSchema, UpdateChannelSchema, AddChannelMemberSchema } from '../shared';
import { channelService } from '../services/channel.service';
import { authenticate } from '../middleware/auth.middleware';
import {
  requireWorkspaceMember,
  requireWorkspaceMemberViaChannel,
  requireRole,
  requireChannelMember,
} from '../middleware/rbac.middleware';

export const channelRouter = Router({ mergeParams: true });

// ── GET /workspaces/:wid/channels ─────────────────────────────────────────────

channelRouter.get(
  '/workspaces/:wid/channels',
  authenticate,
  requireWorkspaceMember((req) => req.params['wid'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const channels = await channelService.listForWorkspace(
        req.params['wid'] ?? '',
        req.user!.id,
      );
      res.json({ success: true, data: { channels } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /workspaces/:wid/channels ────────────────────────────────────────────

channelRouter.post(
  '/workspaces/:wid/channels',
  authenticate,
  requireWorkspaceMember((req) => req.params['wid'] ?? ''),
  requireRole('member'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateChannelSchema.parse(req.body);
      const channel = await channelService.create(req.params['wid'] ?? '', req.user!.id, body);
      res.status(201).json({ success: true, data: { channel } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /workspaces/:wid/dm ──────────────────────────────────────────────────

channelRouter.post(
  '/workspaces/:wid/dm',
  authenticate,
  requireWorkspaceMember((req) => req.params['wid'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetUserId } = z.object({ targetUserId: z.string().uuid() }).parse(req.body);
      const channel = await channelService.getOrCreateDm(
        req.params['wid'] ?? '',
        req.user!.id,
        targetUserId,
      );
      res.json({ success: true, data: { channel } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /channels/:id ─────────────────────────────────────────────────────────

channelRouter.get(
  '/channels/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const channel = await channelService.getById(req.params['id'] ?? '', req.user!.id);
      res.json({ success: true, data: { channel } });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /channels/:id ───────────────────────────────────────────────────────
// Requires workspace admin role.

channelRouter.patch(
  '/channels/:id',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  requireWorkspaceMemberViaChannel((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = UpdateChannelSchema.parse(req.body);
      const updated = await channelService.update(req.params['id'] ?? '', body);
      res.json({ success: true, data: { channel: updated } });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /channels/:id ──────────────────────────────────────────────────────
// Requires workspace admin role.

channelRouter.delete(
  '/channels/:id',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  requireWorkspaceMemberViaChannel((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await channelService.delete(req.params['id'] ?? '');
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /channels/:id/members ─────────────────────────────────────────────────
// Any channel member can view the member list.

channelRouter.get(
  '/channels/:id/members',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await channelService.getMembers(req.params['id'] ?? '');
      res.json({ success: true, data: { members } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /channels/:id/members ────────────────────────────────────────────────
// Requires workspace admin role to add members to a channel.

channelRouter.post(
  '/channels/:id/members',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  requireWorkspaceMemberViaChannel((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = AddChannelMemberSchema.parse(req.body);
      const member = await channelService.addMember(req.params['id'] ?? '', userId);
      res.status(201).json({ success: true, data: { member } });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /channels/:id/members/:userId ──────────────────────────────────────
// Requires workspace admin role.

channelRouter.delete(
  '/channels/:id/members/:userId',
  authenticate,
  requireChannelMember((req) => req.params['id'] ?? ''),
  requireWorkspaceMemberViaChannel((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await channelService.removeMember(req.params['id'] ?? '', req.params['userId'] ?? '');
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);
