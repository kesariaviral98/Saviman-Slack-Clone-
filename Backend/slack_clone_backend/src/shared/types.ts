// ─────────────────────────────────────────────────────────────────────────────
// Shared communication types — API envelopes and Socket.io payload shapes.
// These are not DB-table models; they describe wire formats only.
// ─────────────────────────────────────────────────────────────────────────────

import type { Message } from '../models/message.model';
import type { UserPublic, UserStatus } from '../models/user.model';
import type { ReactionGroup } from '../models/reaction.model';
import type { Call } from '../models/call.model';

// ── API Envelopes ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ── Socket Ack ────────────────────────────────────────────────────────────────

export interface SocketAck<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Socket Payloads (Client → Server) ─────────────────────────────────────────

export interface WsSendMessage {
  channelId: string;
  content: string;
  parentId?: string;
  clientTempId: string;
}

export interface WsEditMessage {
  messageId: string;
  content: string;
}

export interface WsDeleteMessage {
  messageId: string;
}

export interface WsReactionAdd {
  messageId: string;
  emoji: string;
}

export interface WsReactionRemove {
  messageId: string;
  emoji: string;
}

export interface WsTyping {
  channelId: string;
}

export interface WsChannelJoin {
  channelId: string;
}

export interface WsChannelLeave {
  channelId: string;
}

export interface WsChannelSync {
  channelId: string;
  lastSeenSequence: number;
}

export interface WsPresenceStatus {
  status: UserStatus;
}

export interface WsCallInitiate {
  channelId: string;
}

export interface WsCallAccept {
  callId: string;
}

export interface WsCallReject {
  callId: string;
}

export interface WsCallEnd {
  callId: string;
}

export interface WsCallSdpOffer {
  callId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WsCallSdpAnswer {
  callId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WsCallIceCandidate {
  callId: string;
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface WsNotificationRead {
  notificationId: string;
}

// ── Socket Payloads (Server → Client) ─────────────────────────────────────────

export interface WsMessageNew {
  message: Message;
  clientTempId?: string;
}

export interface WsMessageUpdated {
  messageId: string;
  content: string;
  isEdited: boolean;
  editedAt: string;
}

export interface WsMessageDeleted {
  messageId: string;
  channelId: string;
}

export interface WsReactionUpdated {
  messageId: string;
  reactions: ReactionGroup[];
}

export interface WsTypingUpdate {
  channelId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

export interface WsPresenceChanged {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
}

export interface WsCallRinging {
  call: Call;
  initiator: UserPublic;
}

export interface WsCallAccepted {
  callId: string;
  userId: string;
}

export interface WsCallRejected {
  callId: string;
  userId: string;
}

export interface WsCallEnded {
  callId: string;
}

export interface WsCallParticipantJoined {
  callId: string;
  user: UserPublic;
}

export interface WsCallParticipantLeft {
  callId: string;
  userId: string;
}

export interface WsCallSdpOfferFromServer {
  callId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WsCallSdpAnswerFromServer {
  callId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WsCallIceCandidateFromServer {
  callId: string;
  fromUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface WsUnreadCount {
  channelId: string;
  count: number;
}

export interface WsChannelSyncResponse {
  channelId: string;
  messages: Message[];
}

export interface WsError {
  code: string;
  message: string;
}
