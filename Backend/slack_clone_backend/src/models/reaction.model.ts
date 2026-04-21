// ─────────────────────────────────────────────────────────────────────────────
// Reaction model — corresponds to the "Reaction" table.
// ─────────────────────────────────────────────────────────────────────────────

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

/** Reactions grouped by emoji for display */
export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}
