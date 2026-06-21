import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  appendActionEvent,
  createAction,
  getAction,
  getActionEvents,
  listActions,
  readActionInput,
  recordTerminalAction,
  requestActionCancellation,
} from './ai-actions';

describe('AI actions', () => {
  let userId: string;
  beforeEach(async () => {
    await clearAiData();
    userId = await createAiTestUser('admin');
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  });
  afterEach(async () => removeAiTestUser(userId));

  it('encrypts content inputs and exposes ordered reconnectable events', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'private' } });
    const stored = await db.query.aiActionInputs.findFirst({ where: eq(schema.aiActionInputs.actionId, action.id) });
    expect(stored?.payloadEncrypted).not.toContain('private');
    expect(await readActionInput(action.id)).toEqual({ query: 'private' });
    const cursor = await appendActionEvent(action.id, 'text_delta', { text: 'hello' });
    expect((await getActionEvents(ctx, action.id, cursor - 1))[0]?.payload).toEqual({ text: 'hello' });
  });

  it('enforces ownership and cancellation state', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'q' } });
    const cancelled = await requestActionCancellation(ctx, action.id);
    expect(cancelled.status).toBe('queued');
    expect((await getAction(ctx, action.id)).id).toBe(action.id);
  });

  it('paginates the audit listing with limit/offset and a total count', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await db.insert(schema.aiActions).values(
      Array.from({ length: 5 }, () => ({ feature: 'provider_test' as const, actorUserId: userId, expiresAt })),
    );
    const ctx = buildUserCtx(userId, 'admin');
    const firstPage = await listActions(ctx, { limit: 2, offset: 0 });
    expect(firstPage.total).toBe(5);
    expect(firstPage.items).toHaveLength(2);
    const lastPage = await listActions(ctx, { limit: 2, offset: 4 });
    expect(lastPage.total).toBe(5);
    expect(lastPage.items).toHaveLength(1);
  });

  it('rejects audit listing for callers without manage_ai permission', async () => {
    await expect(listActions(buildUserCtx(userId, 'editor'), {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('records a terminal action with request/response and error detail', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    await recordTerminalAction(ctx, {
      feature: 'provider_test',
      status: 'failed',
      requestMetadata: { mode: 'draft', vendor: 'minimax' },
      resultMetadata: { ok: false, latencyMs: 5 },
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: 'rejected',
      errorDetail: 'stack-trace-here',
    });
    const { items } = await listActions(ctx, { feature: 'provider_test' });
    expect(items[0]).toMatchObject({
      feature: 'provider_test',
      status: 'failed',
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorDetail: 'stack-trace-here',
    });
    expect(items[0]?.requestMetadata).toMatchObject({ mode: 'draft', vendor: 'minimax' });
    expect(items[0]?.resultMetadata).toMatchObject({ ok: false, latencyMs: 5 });
  });
});
