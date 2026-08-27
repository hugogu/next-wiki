import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

describe('Agent memory schema', () => {
  it('exports the namespace, binding, record, evidence, and capture tables', () => {
    expect([
      getTableName(schema.agentMemoryNamespaces),
      getTableName(schema.agentMemoryKeyBindings),
      getTableName(schema.agentMemoryRecords),
      getTableName(schema.agentMemoryEvidenceLinks),
      getTableName(schema.agentMemoryCaptures),
    ]).toEqual([
      'agent_memory_namespaces',
      'agent_memory_key_bindings',
      'agent_memory_records',
      'agent_memory_evidence_links',
      'agent_memory_captures',
    ]);
  });

  it('makes namespace idempotency and backing pages explicit record fields', () => {
    expect(Object.keys(schema.agentMemoryRecords)).toEqual(expect.arrayContaining([
      'namespaceId', 'agentIdentity', 'pageId', 'currentRevisionId', 'idempotencyKey', 'state', 'forgottenAt',
    ]));
    expect(Object.keys(schema.agentMemoryCaptures)).toEqual(expect.arrayContaining([
      'namespaceId', 'agentIdentity', 'idempotencyKey', 'payloadDigest', 'status',
    ]));
  });
});
