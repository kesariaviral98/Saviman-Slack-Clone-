// ─────────────────────────────────────────────────────────────────────────────
// Workspace Router
//   GET    /workspaces                         — list user's workspaces
//   POST   /workspaces                         — create workspace
//   GET    /workspaces/:id                     — get workspace details
//   PATCH  /workspaces/:id                     — update workspace (admin)
//   GET    /workspaces/:id/members             — list members
//   DELETE /workspaces/:id/members/:userId     — remove member (admin)
//   POST   /workspaces/:id/invites             — generate invite token (admin)
//   GET    /invites/:token                     — get workspace info from token
//   POST   /invites/:token/accept              — accept invite and join workspace
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { CreateWorkspaceSchema, UpdateWorkspaceSchema, ChangeRoleSchema } from '../shared';
import { workspaceService } from '../services/workspace.service';
import { presenceService } from '../services/presence.service';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import {
  requireWorkspaceMember,
  requireRole,
} from '../middleware/rbac.middleware';

export const workspaceRouter = Router();

// ── GET /workspaces ───────────────────────────────────────────────────────────

workspaceRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspaces = await workspaceService.listForUser(req.user!.id);
      res.json({ success: true, data: { workspaces } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /workspaces ──────────────────────────────────────────────────────────

workspaceRouter.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateWorkspaceSchema.parse(req.body);
      const workspace = await workspaceService.create(req.user!.id, body.name, body.slug);
      res.status(201).json({ success: true, data: { workspace } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /workspaces/:id ───────────────────────────────────────────────────────

workspaceRouter.get(
  '/:id',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspace = await workspaceService.getById(req.params['id'] ?? '');
      res.json({ success: true, data: { workspace } });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /workspaces/:id ─────────────────────────────────────────────────────

workspaceRouter.patch(
  '/:id',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = UpdateWorkspaceSchema.parse(req.body);
      const workspace = await workspaceService.update(req.params['id'] ?? '', body);
      res.json({ success: true, data: { workspace } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /workspaces/:id/members ───────────────────────────────────────────────

workspaceRouter.get(
  '/:id/members',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await workspaceService.getMembers(req.params['id'] ?? '');
      res.json({ success: true, data: { members } });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /workspaces/:id/members/:userId/role ────────────────────────────────
// Admins can promote/demote members. Only the owner can grant the admin role.

workspaceRouter.patch(
  '/:id/members/:userId/role',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role } = ChangeRoleSchema.parse(req.body);
      const member = await workspaceService.changeMemberRole(
        req.params['id'] ?? '',
        req.params['userId'] ?? '',
        role,
        req.user!.id,
      );
      res.json({ success: true, data: { member } });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /workspaces/:id ────────────────────────────────────────────────────
// Only the workspace owner can delete it.

workspaceRouter.delete(
  '/:id',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await workspaceService.delete(req.params['id'] ?? '', req.user!.id);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /workspaces/:id/members/:userId ────────────────────────────────────

workspaceRouter.delete(
  '/:id/members/:userId',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await workspaceService.removeMember(
        req.params['id'] ?? '',
        req.params['userId'] ?? '',
        req.user!.id,
      );
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /workspaces/:id/presence ─────────────────────────────────────────────
// Returns online/status for every member in one Redis MGET round-trip.

workspaceRouter.get(
  '/:id/presence',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await workspaceService.getMembers(req.params['id'] ?? '');
      const userIds = members.map((m) => m.userId);
      const presenceMap = await presenceService.getPresenceBatch(userIds);

      // Convert Map to plain object for JSON serialization
      const presence: Record<string, { isOnline: boolean; status: string }> = {};
      for (const [userId, data] of presenceMap) {
        presence[userId] = { isOnline: data.isOnline, status: data.status };
      }

      res.json({ success: true, data: { presence } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /workspaces/:id/invites ──────────────────────────────────────────────

workspaceRouter.post(
  '/:id/invites',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = await workspaceService.createInvite(req.params['id'] ?? '');
      res.status(201).json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /workspaces/:id/invites/email ────────────────────────────────────────
// Generate an invite token and send it to the given email address.

workspaceRouter.post(
  '/:id/invites/email',
  authenticate,
  requireWorkspaceMember((req) => req.params['id'] ?? ''),
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as { email?: unknown };
      if (typeof email !== 'string' || !email.includes('@')) {
        throw new AppError(400, 'A valid email address is required');
      }
      await workspaceService.sendInviteEmail(
        req.params['id'] ?? '',
        req.user!.id,
        email.toLowerCase().trim(),
      );
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /invites/:token ───────────────────────────────────────────────────────

workspaceRouter.get(
  '/invites/:token',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspace = await workspaceService.getInviteWorkspace(req.params['token'] ?? '');
      res.json({ success: true, data: { workspace } });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /invites/:token/accept ───────────────────────────────────────────────

workspaceRouter.post(
  '/invites/:token/accept',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspace = await workspaceService.acceptInvite(
        req.params['token'] ?? '',
        req.user!.id,
      );
      res.json({ success: true, data: { workspace } });
    } catch (err) {
      next(err);
    }
  },
);
