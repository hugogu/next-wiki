import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOptionalPublicJson } from './route';

describe('parseOptionalPublicJson', () => {
  const schema = z.object({ reason: z.string().min(1).max(500).optional() });

  it('accepts an empty body for optional request payloads', async () => {
    const result = await parseOptionalPublicJson(
      new NextRequest('http://localhost/api/v1/hermes/memory/records/id', { method: 'DELETE' }),
      schema,
    );

    expect(result).toEqual({ ok: true, data: {} });
  });

  it('still rejects malformed JSON when a body is supplied', async () => {
    const result = await parseOptionalPublicJson(
      new NextRequest('http://localhost/api/v1/hermes/memory/records/id', {
        method: 'DELETE',
        body: '{',
        headers: { 'content-type': 'application/json' },
      }),
      schema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
  });
});
