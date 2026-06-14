import { NextResponse } from 'next/server';
import { checkReadiness } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { ok, services } = await checkReadiness();
  return NextResponse.json({ status: ok ? 'ready' : 'not ready', services }, { status: ok ? 200 : 503 });
}
