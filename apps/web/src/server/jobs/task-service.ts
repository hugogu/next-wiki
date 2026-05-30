import { getBoss } from "./boss";
import type { JobRef } from "@next-wiki/shared";

export type TaskPayload<T = Record<string, unknown>> = {
  requestedByUserId: string | null;
  resourceType?: string;
  resourceId?: string;
  data: T;
};

/**
 * Enqueue a background job and return a reference to it.
 * All long-running operations (AI inference, indexing, imports) MUST go through here.
 */
export async function enqueueTask<T = Record<string, unknown>>(
  taskType: string,
  payload: TaskPayload<T>,
  options?: { priority?: number; startAfter?: Date; retryLimit?: number },
): Promise<JobRef> {
  const boss = getBoss();
  const jobId = await boss.send(taskType, payload, {
    priority: options?.priority ?? 0,
    startAfter: options?.startAfter,
    retryLimit: options?.retryLimit ?? 3,
    retryDelay: 30,
    expireInSeconds: 60 * 60 * 24, // 24h max
  });

  if (!jobId) {
    throw new Error(`Failed to enqueue task '${taskType}'`);
  }

  return {
    jobId,
    status: "queued",
  };
}

/**
 * Register a handler for a given task type.
 * Called during worker bootstrap to wire up all job processors.
 */
export async function registerHandler<T = Record<string, unknown>>(
  taskType: string,
  handler: (payload: TaskPayload<T>) => Promise<void>,
  options?: { teamSize?: number; batchSize?: number },
): Promise<void> {
  const boss = getBoss();
  await boss.work<TaskPayload<T>>(
    taskType,
    { teamSize: options?.teamSize ?? 1, batchSize: options?.batchSize ?? 1 },
    async (job) => {
      await handler(job.data);
    },
  );
}
