import { z } from 'zod';

export const CallInitiateSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  callType: z.enum(['audio', 'video']).default('video'),
});
export type CallInitiateInput = z.infer<typeof CallInitiateSchema>;

export const CallAcceptSchema = z.object({
  callId: z.string().uuid('Invalid call ID'),
});
export type CallAcceptInput = z.infer<typeof CallAcceptSchema>;

export const CallRejectSchema = z.object({
  callId: z.string().uuid('Invalid call ID'),
});
export type CallRejectInput = z.infer<typeof CallRejectSchema>;

export const CallEndSchema = z.object({
  callId: z.string().uuid('Invalid call ID'),
});
export type CallEndInput = z.infer<typeof CallEndSchema>;

export const CallSdpOfferSchema = z.object({
  callId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().optional(),
  }),
});
export type CallSdpOfferInput = z.infer<typeof CallSdpOfferSchema>;

export const CallSdpAnswerSchema = z.object({
  callId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().optional(),
  }),
});
export type CallSdpAnswerInput = z.infer<typeof CallSdpAnswerSchema>;

export const CallIceCandidateSchema = z.object({
  callId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
});
export type CallIceCandidateInput = z.infer<typeof CallIceCandidateSchema>;
