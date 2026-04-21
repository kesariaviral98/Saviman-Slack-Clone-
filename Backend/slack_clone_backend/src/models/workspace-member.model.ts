// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceMember model — corresponds to the "WorkspaceMember" table.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkspaceRole } from './workspace.model';
import type { UserPublic } from './user.model';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  user?: UserPublic;
}
