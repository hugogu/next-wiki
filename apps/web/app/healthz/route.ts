import { NextResponse } from 'next/server';
import { checkHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ok, services } = await checkHealth();
  return NextResponse.json({ status: ok ? 'ok' : 'error', services }, { status: ok ? 200 : 503 });
}
