import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const createTagSchema = { name: z.string().min(1).max(100).describe('Tag display name') };
export async function createTag(client: WikiApiClient, args: z.infer<z.ZodObject<typeof createTagSchema>>) { return client.createTag(args.name); }
