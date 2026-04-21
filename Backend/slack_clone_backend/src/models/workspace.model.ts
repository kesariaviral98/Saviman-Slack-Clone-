// ─────────────────────────────────────────────────────────────────────────────
// Workspace model — corresponds to the "Workspace" table.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'guest' | 'member' | 'admin';

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
}
