// ─────────────────────────────────────────────────────────────────────────────
// Calling Router — read-only REST endpoints for call state and history.
//
// All write operations (initiate, accept, reject, end, SDP/ICE relay) happen
// exclusively over Socket.io in calling.handler.ts.
//
//   GET /calls/channels/:channelId         — active/ringing call in a channel
//   GET /calls/channels/:channelId/history — paginated ended calls
//   GET /calls/:callId                     — single call details
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { callingService } from '../services/calling.service';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';

export const callingRouter = Router();

// All calling routes require authentication
callingRouter.use(authenticate);

// ── GET /calls/channels/:channelId ────────────────────────────────────────────
// Returns the currently ringing or active call, or null if none.

callingRouter.get(
  '/channels/:channelId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { channelId } = req.params as { channelId: string };

      // Verify the requesting user is a channel member
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: req.user!.id } },
      });
      if (!member) throw new AppError(403, 'You are not a member of this channel');

      const call = await callingService.getActiveCall(channelId);
      res.json({ success: true, data: { call } });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /calls/channels/:channelId/history ─────────────────────────────────────

callingRouter.get(
  '/channels/:channelId/history',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { channelId } = req.params as { channelId: string };

      // Verify channel membership
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: req.user!.id } },
      });
      if (!member) throw new AppError(403, 'You are not a member of this channel');

      const query = z
        .object({
          before: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(req.query);

      const result = await callingService.getCallHistory(channelId, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /calls/:callId ────────────────────────────────────────────────────────

callingRouter.get(
  '/:callId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { callId } = req.params as { callId: string };

      const call = await callingService.getCallById(callId);

      // Verify the requesting user is a channel member
      const member = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: call.channelId, userId: req.user!.id } },
      });
      if (!member) throw new AppError(403, 'You are not a member of this channel');

      res.json({ success: true, data: { call } });
    } catch (err) {
      next(err);
    }
  },
);
