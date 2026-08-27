import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

describe('Hermes memory schema', () => {
  it('exports the namespace, binding, record, evidence, and capture tables', () => {
    expect([
      getTableName(schema.hermesMemoryNamespaces),
      getTableName(schema.hermesMemoryKeyBindings),
      getTableName(schema.hermesMemoryRecords),
      getTableName(schema.hermesMemoryEvidenceLinks),
      getTableName(schema.hermesMemoryCaptures),
    ]).toEqual([
      'hermes_memory_namespaces',
      'hermes_memory_key_bindings',
      'hermes_memory_records',
      'hermes_memory_evidence_links',
      'hermes_memory_captures',
    ]);
  });

  it('makes namespace idempotency and backing pages explicit record fields', () => {
    expect(Object.keys(schema.hermesMemoryRecords)).toEqual(expect.arrayContaining([
      'namespaceId', 'pageId', 'currentRevisionId', 'idempotencyKey', 'state', 'forgottenAt',
    ]));
  });
});
