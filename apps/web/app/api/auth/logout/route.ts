import { NextResponse } from 'next/server';
import { internalError } from '@/server/api/errors';
import * as authService from '@/server/services/auth';

export async function POST() {
  try {
    await authService.logout();
    return NextResponse.json({ ok: true });
  } catch {
    return internalError();
  }
}
