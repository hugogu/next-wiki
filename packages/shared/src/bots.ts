import { z } from 'zod';

export const DEFAULT_WIKI_QUESTION_MIN_RELEVANCE_SCORE = 0.5;

export const botGeneralSettingsSchema = z.object({
  wikiQuestionMinRelevanceScore: z.number().min(0).max(1),
  updatedAt: z.string().nullable(),
});
export type BotGeneralSettings = z.infer<typeof botGeneralSettingsSchema>;

export const updateBotGeneralSettingsSchema = z.object({
  wikiQuestionMinRelevanceScore: z.coerce.number().min(0).max(1),
});
export type UpdateBotGeneralSettings = z.infer<typeof updateBotGeneralSettingsSchema>;
