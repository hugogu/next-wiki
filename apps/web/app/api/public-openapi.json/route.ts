import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { toPublicOpenApiDocument } from '@/server/api/public-openapi';

export const dynamic = 'force-dynamic';

/**
 * @openapi
 * @summary Public OpenAPI specification
 * @description Returns the public subset of the generated OpenAPI 3.1 document: the /v1 paths plus the schemas and tags they reference.
 */
export async function GET() {
  const filePath = path.resolve(process.cwd(), 'public', 'openapi.json');
  const source = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return NextResponse.json(toPublicOpenApiDocument(source));
}
