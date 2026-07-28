import { getToolDefinition, listToolDefinitions } from './ai-tool-registry';
import { executeTool, hasExecutor } from './ai-tool-executors';

/**
 * The argument hint the model is shown must match what the executor accepts.
 *
 * `get_neighborhood` documented `path` as an accepted reference while its
 * executor demanded a UUID `pageId`. A model that had just read a page by path
 * followed the hint, got "The tool arguments were invalid", and had no way to
 * tell which argument was wrong. Both halves of that are covered here.
 */
describe('tool argument contracts', () => {
  const executable = listToolDefinitions().filter((tool) => hasExecutor(tool.name));

  it('gives every executable tool a JSON Schema the model can follow', () => {
    expect(executable.length).toBeGreaterThan(0);
    for (const tool of executable) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeTypeOf('object');
    }
  });

  it.each(['get_page', 'get_backlinks', 'get_neighborhood'])(
    '%s accepts a page path as well as an id',
    (name) => {
      // These three take the same kind of reference. A model that resolved a
      // page by path should not have to re-resolve it to a UUID for one of them.
      const tool = executable.find((item) => item.name === name);
      expect(tool).toBeDefined();
      expect(Object.keys(tool!.inputSchema.properties)).toEqual(
        expect.arrayContaining(['pageId', 'path']),
      );
      // Neither is individually required: one or the other suffices.
      expect(tool!.inputSchema.required ?? []).not.toContain('pageId');
      expect(tool!.inputSchema.required ?? []).not.toContain('path');
    },
  );

  it('never marks an argument required that the schema does not describe', () => {
    for (const tool of executable) {
      for (const field of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(field);
      }
    }
  });
});

/**
 * Argument validation must tell the model what to fix.
 *
 * "The tool arguments were invalid." gave a model nothing to correct, so its
 * retry repeated the same mistake. The message now names the offending fields
 * — and only the fields, never a submitted value, which can carry page content.
 */
describe('invalid tool arguments', () => {
  const ctx = { actor: { kind: 'user' as const, userId: 'u1', role: 'admin' as const } };
  const execCtx = {
    actorUserId: 'u1',
    effectiveReview: 'none' as const,
    workflowId: '00000000-0000-4000-8000-000000000001',
    toolCallId: '00000000-0000-4000-8000-000000000002',
    actionId: '00000000-0000-4000-8000-000000000003',
  };

  it('names the offending field instead of failing opaquely', async () => {
    const tool = getToolDefinition('create_page')!;
    const result = await executeTool(ctx, tool, { title: 'No path supplied' }, execCtx);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('path');
    expect(result.errorMessage).toMatch(/retry/i);
  });

  it('never echoes a submitted value back into the message', async () => {
    const tool = getToolDefinition('create_page')!;
    const secret = 'S3CRET-PAGE-BODY';
    const result = await executeTool(ctx, tool, { title: 12345, path: secret }, execCtx);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).not.toContain(secret);
  });
});
