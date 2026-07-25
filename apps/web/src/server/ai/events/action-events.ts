import { eq } from 'drizzle-orm';
import type { PermCtx } from '@/server/permissions';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getActionEvents, requireActionAccess } from '@/server/services/ai-actions';

const encoder = new TextEncoder();

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'expired']);

export function serializeSseEvent(event: {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}): Uint8Array {
  return encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
}

export async function createActionEventStream(
  ctx: PermCtx,
  actionId: string,
  after = 0,
): Promise<ReadableStream<Uint8Array>> {
  await requireActionAccess(ctx, actionId);
  let cursor = after;
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Bound the stream by the action's own retention window instead of an
      // arbitrary wall-clock deadline. This keeps long-running tool loops and
      // slow providers alive while still preventing a leaked connection if the
      // worker somehow never terminates.
      const action = await db.query.aiActions.findFirst({
        where: eq(schema.aiActions.id, actionId),
        columns: { expiresAt: true, status: true },
      });
      const expiresAt = action?.expiresAt;

      // If the action is already terminal, send nothing; the client will
      // reconnect and immediately receive the terminal event on the next poll.
      if (action && TERMINAL_STATUSES.has(action.status)) {
        controller.close();
        return;
      }

      let iteration = 0;
      try {
        // Ask the browser to reconnect quickly after a transient proxy/VPN drop.
        controller.enqueue(encoder.encode('retry: 2000\n\n'));

        while (!closed) {
          const now = Date.now();
          if (expiresAt && expiresAt.getTime() <= now) {
            closed = true;
            break;
          }

          const events = await getActionEvents(ctx, actionId, cursor);
          for (const event of events) {
            cursor = event.id;
            controller.enqueue(serializeSseEvent(event));
            if (event.type === 'completed' || event.type === 'error') {
              closed = true;
              break;
            }
          }
          if (closed) break;

          // Every ~5 seconds also check the durable action status. If the
          // worker crashed without emitting a terminal event, we release the
          // connection instead of hanging forever.
          if (++iteration % 20 === 0) {
            const row = await db.query.aiActions.findFirst({
              where: eq(schema.aiActions.id, actionId),
              columns: { status: true },
            });
            if (row && TERMINAL_STATUSES.has(row.status)) {
              closed = true;
              break;
            }
          }

          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });
}
