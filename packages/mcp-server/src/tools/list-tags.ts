import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const listTagsSchema = { q: z.string().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() };
export async function listTags(client: WikiApiClient, args: z.infer<z.ZodObject<typeof listTagsSchema>>) { return client.listTags(args); }
