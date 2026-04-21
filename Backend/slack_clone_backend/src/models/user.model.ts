// ─────────────────────────────────────────────────────────────────────────────
// User model — corresponds to the "User" table.
// ─────────────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'away' | 'dnd';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string;
  isPlatformAdmin: boolean;
  createdAt: string;
}

/** Safe public-facing user — never exposes email or admin flag */
export type UserPublic = Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'statusText'>;
