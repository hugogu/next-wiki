import { describe, expect, it } from 'vitest';
import { buildScheduledAiJobSnapshot, nextScheduledAiJobOccurrence, validateScheduledAiJobSchedule } from './scheduled-ai-jobs';

describe('scheduled AI job scheduling primitives', () => {
  it('calculates the next UTC occurrence using the declared IANA zone', () => {
    expect(nextScheduledAiJobOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-01-01T00:30:00Z')).toISOString())
      .toBe('2026-01-01T01:00:00.000Z');
  });

  it('rejects unsupported cron forms and invalid zones', () => {
    expect(() => validateScheduledAiJobSchedule('* * * * * *', 'UTC')).toThrow();
    expect(() => validateScheduledAiJobSchedule('0 0 * * *', 'Mars/Olympus')).toThrow();
  });

  it('creates an immutable execution snapshot', () => {
    const snapshot = buildScheduledAiJobSnapshot({
      id: 'job', name: 'Daily links', taskDescription: 'Propose links', scheduleCron: '0 9 * * *',
      timeZone: 'UTC', targetScope: { spaceIds: ['00000000-0000-0000-0000-000000000001'], rootPageIds: [], tagIds: [] },
      runAsUserId: '00000000-0000-0000-0000-000000000002', definitionVersion: 2,
    });
    expect(snapshot.version).toBe(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
