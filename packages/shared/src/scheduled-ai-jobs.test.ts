import { describe, expect, it } from 'vitest';
import {
  scheduledAiJobCreateSchema,
  scheduledAiJobRunStatusSchema,
  scheduledAiJobScopeSchema,
  scheduledAiJobStatusSchema,
} from './scheduled-ai-jobs';

const id = '00000000-0000-0000-0000-000000000001';

describe('scheduled AI jobs shared contract', () => {
  it('accepts a bounded recurring definition with a non-empty scope', () => {
    const parsed = scheduledAiJobCreateSchema.parse({
      name: 'Find related payment pages',
      taskDescription: 'Inspect selected pages and prepare link proposals.',
      scheduleCron: '0 3 * * *',
      timeZone: 'Asia/Shanghai',
      targetScope: { spaceIds: [id], rootPageIds: [id], tagIds: [] },
      runAsUserId: id,
      status: 'enabled',
    });
    expect(parsed.status).toBe('enabled');
  });

  it('rejects empty scopes and unsafe cron field counts', () => {
    expect(() => scheduledAiJobScopeSchema.parse({ spaceIds: [], rootPageIds: [], tagIds: [] })).toThrow();
    expect(() => scheduledAiJobCreateSchema.parse({
      name: 'Daily', taskDescription: 'x', scheduleCron: '* * * * * *', timeZone: 'UTC',
      targetScope: { spaceIds: [id] }, runAsUserId: id,
    })).toThrow();
  });

  it('pins durable status values', () => {
    expect(scheduledAiJobStatusSchema.options).toEqual(['enabled', 'paused', 'retired']);
    expect(scheduledAiJobRunStatusSchema.options).toContain('blocked');
  });
});
