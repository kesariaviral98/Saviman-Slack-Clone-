import { z } from 'zod';

export const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(80, 'Workspace name cannot exceed 80 characters')
    .trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(40, 'Slug cannot exceed 40 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .optional(),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

export const ChangeRoleSchema = z.object({
  role: z.enum(['guest', 'member', 'admin'], {
    errorMap: () => ({ message: "Role must be 'guest', 'member', or 'admin'" }),
  }),
});
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
