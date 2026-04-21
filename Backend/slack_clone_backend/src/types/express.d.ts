// ─────────────────────────────────────────────────────────────────────────────
// Express Request augmentation — extends req with fields attached by middleware.
// Import this file (or any file that imports it) to activate the augmentation.
// ─────────────────────────────────────────────────────────────────────────────

declare namespace Express {
  interface Request {
    /** Attached by `authenticate` middleware after JWT verification. */
    user?: {
      id: string;
      email: string;
      displayName: string;
      avatarUrl: string | null;
      isPlatformAdmin: boolean;
    };

    /**
     * Attached by `requireWorkspaceMember` middleware.
     * Roles: guest < member < admin
     */
    workspaceRole?: string;
  }
}
