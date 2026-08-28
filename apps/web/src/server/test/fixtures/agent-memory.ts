/**
 * Non-secret Agent Memory fixture values for route/service tests. Keeping this
 * data-only avoids coupling tests to an OpenClaw runtime or live credentials.
 */
export const agentMemoryFixture = {
  connections: {
    alpha: {
      connectionId: '00000000-0000-4000-8000-0000000000a1',
      agentIdentity: 'agent-alpha',
      privateDestinationId: '00000000-0000-4000-8000-0000000000b1',
    },
    beta: {
      connectionId: '00000000-0000-4000-8000-0000000000a2',
      agentIdentity: 'agent-beta',
      privateDestinationId: '00000000-0000-4000-8000-0000000000b2',
    },
  },
  restrictedRawRevision: {
    pageId: '00000000-0000-4000-8000-0000000000c1',
    revisionId: '00000000-0000-4000-8000-0000000000d1',
    revisionHash: 'fixture-revision-hash',
    visibility: 'restricted' as const,
  },
  grants: {
    activeRead: { grantId: '00000000-0000-4000-8000-0000000000e1', capability: 'read' as const, state: 'active' as const },
    revokedRead: { grantId: '00000000-0000-4000-8000-0000000000e2', capability: 'read' as const, state: 'revoked' as const },
  },
} as const;
