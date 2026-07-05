import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';

async function handleGET() {
  const filePath = path.resolve(process.cwd(), 'public', 'openapi.json');
  const content = await fs.readFile(filePath, 'utf8');
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Serve the generated OpenAPI specification as JSON.
 *
 * @openapi
 * @summary OpenAPI specification
 * @description Returns the generated OpenAPI 3.1 JSON document describing all public REST endpoints.
 * @response 200 {OpenApiSpec}
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
