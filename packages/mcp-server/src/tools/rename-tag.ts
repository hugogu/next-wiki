import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const renameTagSchema = { tagId: z.string().uuid(), name: z.string().min(1).max(100) };
export async function renameTag(client: WikiApiClient, args: z.infer<z.ZodObject<typeof renameTagSchema>>) { return client.renameTag(args.tagId, args.name); }
