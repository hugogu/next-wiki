import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { numberArg } from './_scalar-args';

export const listTagsSchema = { q: z.string().optional(), limit: numberArg(z.number().int().min(1).max(100)).optional(), cursor: z.string().optional() };
export async function listTags(client: WikiApiClient, args: z.infer<z.ZodObject<typeof listTagsSchema>>) { return client.listTags(args); }
