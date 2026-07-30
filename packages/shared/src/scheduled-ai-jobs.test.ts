import { describe, expect, it } from 'vitest';
import {
  scheduledAiJobCreateSchema,
  scheduledAiJobRunStatusSchema,
  scheduledAiJobScopeSchema,
  scheduledAiJobStatusSchema,
} from './scheduled-ai-jobs';

const id = '00000000-0000-0000-0000-000000000001';

describe('scheduled AI jobs shared contract', () => {
  it('accepts a bounded recurring definition with a write scope', () => {
    const parsed = scheduledAiJobCreateSchema.parse({
      name: 'Find related payment pages',
      taskDescription: 'Inspect selected pages and prepare link proposals.',
      scheduleCron: '0 3 * * *',
      timeZone: 'Asia/Shanghai',
      targetScope: { spaceIds: [id], skillNames: ['wiki-linker'] },
      status: 'enabled',
    });
    expect(parsed.status).toBe('enabled');
  });

  it('allows a read-only Job and rejects unsafe cron field counts', () => {
    expect(scheduledAiJobScopeSchema.parse({ spaceIds: [], skillNames: [] })).toEqual({
      spaceIds: [],
      skillNames: [],
    });
    expect(() =>
      scheduledAiJobCreateSchema.parse({
        name: 'Daily',
        taskDescription: 'x',
        scheduleCron: '* * * * * *',
        timeZone: 'UTC',
        targetScope: { spaceIds: [id] },
      }),
    ).toThrow();
  });

  it('pins durable status values', () => {
    expect(scheduledAiJobStatusSchema.options).toEqual(['enabled', 'paused', 'retired']);
    expect(scheduledAiJobRunStatusSchema.options).toContain('blocked');
  });
});
