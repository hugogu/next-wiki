import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: {
    scheduledAiJobs: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));
const permissions = vi.hoisted(() => ({
  can: vi.fn(),
  getActorUserId: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db }));
vi.mock('@/server/jobs/runtime', () => ({ enqueue: vi.fn(), QUEUES: { scheduledAiRun: 'scheduled-ai-run' } }));
vi.mock('@/server/permissions', () => permissions);

import {
  buildScheduledAiJobSnapshot,
  nextScheduledAiJobOccurrence,
  tickScheduledAiJobs,
  updateScheduledAiJob,
  validateScheduledAiJobSchedule,
} from './scheduled-ai-jobs';

function scheduledJob(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    name: 'Daily links',
    normalizedName: 'daily links',
    taskDescription: 'Propose links',
    scheduleCron: '0 9 * * *',
    timeZone: 'UTC',
    targetScope: { spaceIds: ['00000000-0000-0000-0000-000000000001'], skillNames: [] },
    runAsUserId: '00000000-0000-0000-0000-000000000002',
    status: 'enabled',
    definitionVersion: 2,
    nextRunAt: new Date('2026-01-02T09:00:00.000Z'),
    lastRunAt: null,
    lastSuccessAt: null,
    createdByUserId: '00000000-0000-0000-0000-000000000003',
    updatedByUserId: '00000000-0000-0000-0000-000000000003',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    retiredAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.can.mockReturnValue(true);
  permissions.getActorUserId.mockReturnValue('00000000-0000-0000-0000-000000000003');
});

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
      timeZone: 'UTC', targetScope: { spaceIds: ['00000000-0000-0000-0000-000000000001'], skillNames: [] },
      runAsUserId: '00000000-0000-0000-0000-000000000002', definitionVersion: 2,
    });
    expect(snapshot.version).toBe(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('preserves the next occurrence when changing non-scheduling fields', async () => {
    const current = scheduledJob();
    db.query.scheduledAiJobs.findFirst.mockResolvedValue(current);
    db.query.users.findFirst.mockResolvedValue({ id: current.runAsUserId, status: 'active', deletedAt: null });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: current.targetScope.spaceIds[0] }]) }),
    });
    const returning = vi.fn().mockResolvedValue([{ ...current, name: 'Renamed links', normalizedName: 'renamed links' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    await updateScheduledAiJob({ actor: { kind: 'user', userId: '00000000-0000-0000-0000-000000000003', role: 'admin' } }, current.id, {
      name: 'Renamed links',
    });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ nextRunAt: current.nextRunAt }));
  });

  it('records a skipped occurrence when another run owns the active slot', async () => {
    const job = scheduledJob();
    const occurrence = job.nextRunAt;
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([job]) }),
      }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([job]) }),
      }),
    });
    db.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({ code: '23505', constraint_name: 'scheduled_ai_job_runs_active_job_unique' }),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      });

    await tickScheduledAiJobs(new Date('2026-01-02T10:00:00.000Z'));

    const skippedValues = db.insert.mock.results[1]?.value.values as ReturnType<typeof vi.fn>;
    expect(skippedValues).toHaveBeenCalledWith(expect.objectContaining({
      status: 'skipped',
      scheduledFor: occurrence,
      errorCode: 'SCHEDULED_JOB_ACTIVE_RUN',
    }));
  });
});
