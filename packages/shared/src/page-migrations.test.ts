import { describe, expect, it } from 'vitest';
import { spaceMigrationConfirmInputSchema, spaceMigrationPreviewInputSchema } from './page-migrations';

const sourceSpaceId = '11111111-1111-4111-8111-111111111111';
const destinationSpaceId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
export const migrationRequestFixture = { selection: { kind: 'page' as const, pageId }, destinationSpaceId };

describe('space migration contracts', () => {
  it('accepts a page preview with the default OKF policy', () => {
    expect(spaceMigrationPreviewInputSchema.parse({
      ...migrationRequestFixture,
    })).toMatchObject({ adaptOkf: true, selection: { kind: 'page', pageId } });
  });

  it('accepts folder selection and rejects an invalid confirmation fingerprint', () => {
    expect(spaceMigrationPreviewInputSchema.parse({
      selection: { kind: 'folder', sourceSpaceId, pathPrefix: 'imports/ai' }, destinationSpaceId,
    }).selection.kind).toBe('folder');
    expect(spaceMigrationConfirmInputSchema.safeParse({ previewId: pageId, fingerprint: 'short' }).success).toBe(false);
  });
});
