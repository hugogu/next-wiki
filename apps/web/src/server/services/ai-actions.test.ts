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
  readActionInput,
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
});
