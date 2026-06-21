import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../../test/ai-fixtures';
import { appendActionEvent, createAction } from '@/server/services/ai-actions';
import { createActionEventStream, serializeSseEvent } from './action-events';

describe('AI action SSE', () => {
  it('serializes cursor, event, and JSON data', () => {
    expect(new TextDecoder().decode(serializeSseEvent({ id: 4, type: 'status', payload: { status: 'running' } })))
      .toBe('id: 4\nevent: status\ndata: {"status":"running"}\n\n');
  });

  it('replays after a cursor and closes at terminal event', async () => {
    await clearAiData();
    const userId = await createAiTestUser('admin');
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'q' } });
    const skipped = await appendActionEvent(action.id, 'text_delta', { text: 'skip' });
    await appendActionEvent(action.id, 'completed', { status: 'completed' });
    const response = new Response(await createActionEventStream(ctx, action.id, skipped));
    expect(await response.text()).toContain('event: completed');
    await removeAiTestUser(userId);
  });
});
