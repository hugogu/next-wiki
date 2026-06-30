import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { toPublicOpenApiDocument } from '@/server/api/public-openapi';

export const dynamic = 'force-dynamic';

export async function GET() {
  const filePath = path.resolve(process.cwd(), 'public', 'openapi.json');
  const source = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return NextResponse.json(toPublicOpenApiDocument(source));
}
