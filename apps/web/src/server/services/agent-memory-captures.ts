import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { requireAgentMemoryAccess } from '@/server/permissions/agent-memory';
import { createEvidenceRecord, evidencePayloadDigest, recordToView } from '@/server/services/agent-memory';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { decryptAiJson, encryptAiJson } from '@/server/crypto/ai-encryption';
import { AGENT_MEMORY_BOUNDS, agentMemoryEvidenceInputSchema } from '@next-wiki/shared';
import type { AgentMemoryCaptureKind, AgentMemoryEvidenceInput, AgentMemoryRecord } from '@next-wiki/shared';

export type AgentMemoryCaptureSubmission = {
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  idempotent: boolean;
};

type CaptureEnvelope = { messages: AgentMemoryEvidenceInput['messages'] };

function resolveCaptureKind(input: Pick<AgentMemoryEvidenceInput, 'checkpoint' | 'captureKind'>): AgentMemoryCaptureKind {
  return input.captureKind ?? (input.checkpoint ? 'checkpoint' : 'turn');
}

/**
 * Admits an idempotent evidence capture. The selected content is held only as
 * an encrypted, bounded, time-limited envelope on the capture row (see
 * AGENT_MEMORY_BOUNDS); the enqueued pg-boss job carries the capture ID only,
 * never the payload (FR-015 / data-model.md capture ledger).
 */
export async function submitEvidenceCapture(
  ctx: PermCtx,
  input: AgentMemoryEvidenceInput,
): Promise<AgentMemoryCaptureSubmission> {
  const parsedInput = agentMemoryEvidenceInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new DomainError('AGENT_MEMORY_EVIDENCE_INVALID', 'Evidence capture payload is invalid or exceeds the configured limits');
  }
  const normalizedInput = parsedInput.data;
  const envelope: CaptureEnvelope = { messages: normalizedInput.messages };
  if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > AGENT_MEMORY_BOUNDS.captureEnvelopeMaxBytes) {
    throw new DomainError('AGENT_MEMORY_EVIDENCE_INVALID', 'Evidence capture payload exceeds the bounded envelope size');
  }
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const payloadDigest = evidencePayloadDigest(normalizedInput);
  const captureKind = resolveCaptureKind(normalizedInput);
  const payloadEncrypted = encryptAiJson(envelope);
  const payloadExpiresAt = new Date(Date.now() + AGENT_MEMORY_BOUNDS.captureEnvelopeTtlHours * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    let [capture] = await tx
      .select()
      .from(schema.agentMemoryCaptures)
      .where(and(
        eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId),
        eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity),
        eq(schema.agentMemoryCaptures.idempotencyKey, normalizedInput.idempotencyKey),
      ))
      .for('update')
      .limit(1);
    let idempotent = Boolean(capture);

    if (capture && capture.payloadDigest !== 'legacy' && (
      capture.payloadDigest !== payloadDigest
      || capture.sessionDigest !== normalizedInput.sessionDigest
      || capture.checkpoint !== normalizedInput.checkpoint
    )) {
      throw new DomainError('CONFLICT', 'The idempotency key is already associated with different evidence');
    }

    if (!capture) {
      const captureId = randomUUID();
      [capture] = await tx
        .insert(schema.agentMemoryCaptures)
        .values({
          id: captureId,
          namespaceId: access.namespaceId,
          apiKeyId: access.keyId,
          connectionId: access.connectionId,
          agentIdentity: access.agentIdentity,
          idempotencyKey: normalizedInput.idempotencyKey,
          payloadDigest,
          sessionDigest: normalizedInput.sessionDigest,
          checkpoint: normalizedInput.checkpoint,
          captureKind,
          payloadEncrypted,
          payloadExpiresAt,
        })
        .onConflictDoNothing({ target: [schema.agentMemoryCaptures.namespaceId, schema.agentMemoryCaptures.agentIdentity, schema.agentMemoryCaptures.idempotencyKey] })
        .returning();
      if (!capture) {
        [capture] = await tx
          .select()
          .from(schema.agentMemoryCaptures)
          .where(and(
            eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId),
            eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity),
            eq(schema.agentMemoryCaptures.idempotencyKey, normalizedInput.idempotencyKey),
          ))
          .for('update')
          .limit(1);
        if (!capture) throw new Error('AGENT_MEMORY_CAPTURE_RESERVATION_FAILED');
        idempotent = true;
        if (capture.payloadDigest !== 'legacy' && (
          capture.payloadDigest !== payloadDigest
          || capture.sessionDigest !== normalizedInput.sessionDigest
          || capture.checkpoint !== normalizedInput.checkpoint
        )) {
          throw new DomainError('CONFLICT', 'The idempotency key is already associated with different evidence');
        }
      }
    }

    if (capture.payloadDigest === 'legacy') {
      await tx.update(schema.agentMemoryCaptures)
        .set({ payloadDigest, updatedAt: new Date() })
        .where(eq(schema.agentMemoryCaptures.id, capture.id));
      capture = { ...capture, payloadDigest };
    }

    if (capture.status === 'durable' || capture.status === 'running' || (capture.status === 'queued' && capture.jobId)) {
      return { captureId: capture.id, status: capture.status, durable: capture.status === 'durable', idempotent };
    }

    // Failed/cancelled captures, and legacy queued rows without a job id, may
    // be retried with the same idempotency key. The row lock above ensures only
    // one concurrent caller can transition and enqueue the retry. The envelope
    // is refreshed because a prior terminal outcome (or TTL expiry) may already
    // have cleared it.
    await tx.update(schema.agentMemoryCaptures)
      .set({
        status: 'queued',
        jobId: null,
        failureCode: null,
        payloadEncrypted,
        payloadExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentMemoryCaptures.id, capture.id));

    let jobId: string | null = null;
    try {
      jobId = await enqueue(QUEUES.agentMemoryCapture, {
        captureId: capture.id,
      }, {
        singletonKey: capture.id,
        singletonSeconds: 60,
        retryLimit: 5,
        retryDelay: 15,
        retryBackoff: true,
        retryDelayMax: 300,
      });
    } catch {
      jobId = null;
    }
    if (!jobId) {
      await tx.update(schema.agentMemoryCaptures)
        .set({ status: 'failed', failureCode: 'JOB_QUEUE_UNAVAILABLE', updatedAt: new Date() })
        .where(eq(schema.agentMemoryCaptures.id, capture.id));
      return { captureId: capture.id, status: 'failed', durable: false, idempotent };
    }
    await tx.update(schema.agentMemoryCaptures)
      .set({ status: 'queued', jobId, failureCode: null, updatedAt: new Date() })
      .where(eq(schema.agentMemoryCaptures.id, capture.id));
    return { captureId: capture.id, status: 'queued', durable: false, idempotent };
  });
}

export async function getEvidenceCapture(ctx: PermCtx, captureId: string): Promise<{
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  evidence?: { evidenceId: string; citation: AgentMemoryRecord['citation'] };
  failureCode?: string;
}> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const capture = await db.query.agentMemoryCaptures.findFirst({
    where: and(eq(schema.agentMemoryCaptures.id, captureId), eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId), eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity)),
  });
  if (!capture) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'Evidence capture not found');
  if (capture.status !== 'durable' || !capture.evidenceRecordId) {
    return {
      captureId: capture.id,
      status: capture.status,
      durable: false,
      ...(capture.failureCode ? { failureCode: capture.failureCode } : {}),
    };
  }
  const record = await db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.id, capture.evidenceRecordId),
      eq(schema.agentMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, access.agentIdentity),
    ),
  });
  const view = record ? await recordToView(record) : null;
  if (!view) {
    throw new DomainError('AGENT_MEMORY_CHECKPOINT_NOT_DURABLE', 'Evidence capture is no longer durable');
  }
  return { captureId: capture.id, status: 'durable', durable: true, evidence: { evidenceId: view.memoryId, citation: view.citation } };
}

/** Worker entry point. Receives only a capture ID; the payload is decrypted from the row itself. */
export async function runEvidenceCapture(data: { captureId: string }): Promise<void> {
  const capture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, data.captureId) });
  // submitEvidenceCapture publishes the pg-boss job while its reservation
  // transaction is still committing. A worker can therefore observe the job
  // before the capture row is visible; throw so pg-boss retries instead of
  // acknowledging a job that would otherwise be lost.
  if (!capture) throw new Error('AGENT_MEMORY_CAPTURE_NOT_VISIBLE');
  if (capture.status === 'durable' || capture.status === 'cancelled') return;

  if (capture.payloadExpiresAt && capture.payloadExpiresAt.getTime() < Date.now()) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_CAPTURE_ENVELOPE_EXPIRED', payloadEncrypted: null, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])));
    return;
  }
  if (!capture.payloadEncrypted) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_CAPTURE_ENVELOPE_MISSING', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])));
    return;
  }

  let envelope: CaptureEnvelope;
  try {
    envelope = decryptAiJson<CaptureEnvelope>(capture.payloadEncrypted);
  } catch {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_CAPTURE_ENVELOPE_INVALID', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])));
    return;
  }

  const parsedInput = agentMemoryEvidenceInputSchema.safeParse({
    idempotencyKey: capture.idempotencyKey,
    sessionDigest: capture.sessionDigest,
    checkpoint: capture.checkpoint,
    messages: envelope.messages,
  });
  if (!parsedInput.success) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_EVIDENCE_INVALID', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])));
    return;
  }
  const payloadDigest = evidencePayloadDigest({
    sessionDigest: capture.sessionDigest,
    checkpoint: capture.checkpoint,
    messages: parsedInput.data.messages,
  });
  if (capture.payloadDigest !== 'legacy' && capture.payloadDigest !== payloadDigest) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_EVIDENCE_INVALID', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'failed'])));
    return;
  }

  // Claim under a row lock so overlapping deliveries cannot both transition a
  // queued capture before the first worker has observed it. A second delivery
  // may still resume a running row after a process crash; all writes below are
  // idempotent and terminal updates are conditional.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.agentMemoryCaptures)
      .where(eq(schema.agentMemoryCaptures.id, capture.id))
      .for('update')
      .limit(1);
    if (!row || row.status === 'durable' || row.status === 'cancelled') return null;
    const [updated] = await tx.update(schema.agentMemoryCaptures)
      .set({ status: 'running', payloadDigest: row.payloadDigest === 'legacy' ? payloadDigest : row.payloadDigest, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, row.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])))
      .returning();
    return updated ?? null;
  });
  if (!claimed) return;

  try {
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, capture.apiKeyId), isNull(schema.apiKeys.revokedAt)),
      with: { user: true },
    });
    if (!key || key.user.status === 'disabled') {
      throw new DomainError('UNAUTHORIZED', 'The Agent memory key is no longer active');
    }
    const workerCtx: PermCtx = {
      actor: {
        kind: 'api_key',
        keyId: key.id,
        userId: key.userId,
        role: key.user.role,
        scopes: key.scopes,
        spaceAccess: key.spaceAccess,
      },
    };
    const workerAccess = await requireAgentMemoryAccess(workerCtx, 'memory.write');
    if (workerAccess.namespaceId !== capture.namespaceId || workerAccess.agentIdentity !== capture.agentIdentity) {
      throw new DomainError('AGENT_MEMORY_EVIDENCE_INVALID', 'Evidence capture no longer matches its key binding');
    }
    const result = await createEvidenceRecord(workerCtx, {
      idempotencyKey: capture.idempotencyKey,
      sessionDigest: capture.sessionDigest,
      checkpoint: capture.checkpoint,
      messages: parsedInput.data.messages,
    });
    // Canonical Raw revision and record mapping are committed above; the
    // transient envelope is no longer needed once a capture is durable.
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'durable', evidenceRecordId: result.record.memoryId, failureCode: null, payloadEncrypted: null, payloadExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), eq(schema.agentMemoryCaptures.status, 'running')));
  } catch (error) {
    const failureCode = error instanceof DomainError ? error.code : 'AGENT_MEMORY_CAPTURE_FAILED';
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), eq(schema.agentMemoryCaptures.status, 'running')));
    // Permanent authorization/validation failures are represented by the
    // durable failed state. Unexpected storage/queue failures must escape so
    // pg-boss can retry the same idempotent capture automatically.
    if (!(error instanceof DomainError) || ![
      'UNAUTHORIZED',
      'FORBIDDEN',
      'AGENT_MEMORY_SCOPE_REQUIRED',
      'AGENT_MEMORY_KEY_UNBOUND',
      'AGENT_MEMORY_NAMESPACE_UNAVAILABLE',
      'AGENT_MEMORY_RECORD_NOT_FOUND',
      'AGENT_MEMORY_EVIDENCE_INVALID',
    ].includes(error.code)) {
      throw error;
    }
  }
}
