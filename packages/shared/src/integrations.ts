import { z } from 'zod';

/**
 * Integrations (031): credentials for external services, owned by no single
 * feature.
 *
 * Git export and static site publishing both authenticate against the same
 * GitHub account. A credential per feature would mean two deploy keys to
 * install — which hosts reject anyway, since deploy-key uniqueness is global —
 * and two places to rotate. The features remain independent in what matters:
 * neither's settings, schedule, state, or artifact affects the other.
 *
 * Secrets are never part of these shapes: they are submitted through a
 * write-only `secret` field and stored encrypted, and no view returns them.
 */

export const integrationKindSchema = z.enum(['github']);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

export const integrationAuthModeSchema = z.enum(['https_token', 'ssh']);
export type IntegrationAuthMode = z.infer<typeof integrationAuthModeSchema>;

export const integrationUpsertSchema = z.object({
  kind: integrationKindSchema,
  /** Operator-facing label, e.g. the account or organization name. */
  label: z.string().optional(),
  authMode: integrationAuthModeSchema,
  username: z.string().optional(),
  /** Write-only. Omitted on update means "keep the stored credential". */
  secret: z.string().min(1).optional(),
});
export type IntegrationUpsert = z.infer<typeof integrationUpsertSchema>;
export type IntegrationUpsertInput = z.input<typeof integrationUpsertSchema>;

export type IntegrationView = {
  id: string;
  kind: IntegrationKind;
  label: string | null;
  authMode: IntegrationAuthMode;
  username: string | null;
  hasSecret: boolean;
  publicKey: string | null;
  fingerprint: string | null;
  updatedAt: string;
};

export type IntegrationSshKeyResult = {
  publicKey: string;
  fingerprint: string;
};

export type IntegrationListResponse = {
  items: IntegrationView[];
};
