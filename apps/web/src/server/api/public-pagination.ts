import { z } from 'zod';

export const publicLimitSchema = z.coerce.number().int().min(1).max(100).default(20);

export type PublicCursor = {
  offset: number;
};

export function decodePublicCursor(cursor: string | undefined): PublicCursor {
  if (!cursor) return { offset: 0 };
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<PublicCursor>;
    const offset = Number(decoded.offset);
    return Number.isInteger(offset) && offset >= 0 ? { offset } : { offset: 0 };
  } catch {
    return { offset: 0 };
  }
}

export function encodePublicCursor(cursor: PublicCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function nextPublicCursor(args: { offset: number; limit: number; itemCount: number }): string | null {
  if (args.itemCount < args.limit) return null;
  return encodePublicCursor({ offset: args.offset + args.itemCount });
}
