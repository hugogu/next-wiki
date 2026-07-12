import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const getTagMutationSchema = { operationId: z.string().uuid() };
export async function getTagMutation(client: WikiApiClient, args: z.infer<z.ZodObject<typeof getTagMutationSchema>>) { return client.getTagMutation(args.operationId); }
