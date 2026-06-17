import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { meOutputSchema } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { internalError } from '@/server/api/errors';

export async function GET() {
  try {
    const actor = await authService.getCurrentActor();
    if (actor.kind === 'anonymous') {
      return NextResponse.json(null);
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, actor.userId),
    });

    if (!user) {
      return NextResponse.json(null);
    }

    const output = meOutputSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
    });

    return NextResponse.json(output);
  } catch {
    return internalError();
  }
}
