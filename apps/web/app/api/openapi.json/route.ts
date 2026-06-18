import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Serve the generated OpenAPI specification as JSON.
 *
 * @openapi
 * @summary OpenAPI specification
 * @description Returns the generated OpenAPI 3.1 JSON document describing all public REST endpoints.
 * @response 200 {OpenApiSpec}
 */
export async function GET() {
  const filePath = path.resolve(process.cwd(), 'public', 'openapi.json');
  const content = await fs.readFile(filePath, 'utf8');
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
