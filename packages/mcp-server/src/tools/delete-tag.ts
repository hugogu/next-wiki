import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const deleteTagSchema = { tagId: z.string().uuid() };
export async function deleteTag(client: WikiApiClient, args: z.infer<z.ZodObject<typeof deleteTagSchema>>) { return client.deleteTag(args.tagId); }
