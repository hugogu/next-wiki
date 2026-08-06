import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

const selectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: z.string().uuid() }),
  z.object({ kind: z.literal('folder'), sourceSpaceId: z.string().uuid(), pathPrefix: z.string().min(1) }),
]);

export const previewSpaceMigrationSchema = {
  selection: selectionSchema,
  destinationSpaceId: z.string().uuid(),
  destinationPathPrefix: z.string().min(1).optional(),
  visibility: z.enum(['public', 'registered', 'restricted']).optional(),
  adaptOkf: z.boolean().optional(),
};
export const startSpaceMigrationSchema = { previewId: z.string().uuid(), fingerprint: z.string().min(16) };
export const getSpaceMigrationSchema = { id: z.string().uuid() };
export const listSpaceMigrationItemsSchema = { id: z.string().uuid(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().uuid().optional() };
export const cancelSpaceMigrationSchema = { id: z.string().uuid() };

export const previewSpaceMigration = (client: WikiApiClient, args: z.infer<z.ZodObject<typeof previewSpaceMigrationSchema>>) => client.previewSpaceMigration({ ...args, adaptOkf: args.adaptOkf ?? true });
export const startSpaceMigration = (client: WikiApiClient, args: z.infer<z.ZodObject<typeof startSpaceMigrationSchema>>) => client.startSpaceMigration(args);
export const getSpaceMigration = (client: WikiApiClient, args: z.infer<z.ZodObject<typeof getSpaceMigrationSchema>>) => client.getSpaceMigration(args.id);
export const listSpaceMigrationItems = (client: WikiApiClient, args: z.infer<z.ZodObject<typeof listSpaceMigrationItemsSchema>>) => client.listSpaceMigrationItems(args.id, args);
export const cancelSpaceMigration = (client: WikiApiClient, args: z.infer<z.ZodObject<typeof cancelSpaceMigrationSchema>>) => client.cancelSpaceMigration(args.id);
