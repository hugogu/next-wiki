import { z } from 'zod';
import { readTextFromPath } from './_file-source';

export const bodyFilePathSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Absolute path of a Markdown or plain-text file (.md, .markdown, .txt) on the MCP server host, read instead of contentSource. ' +
      'Use it for long pages. Must be absolute: "~" and relative paths are not expanded. ' +
      'The server reads it as its own user, and only inside NEXT_WIKI_MCP_FILE_ALLOW_DIRS, which must be set. ' +
      'Mutually exclusive with contentSource.',
  );

/**
 * The Markdown body of create_page / save_draft: the inline contentSource or a
 * file on the server host, never both. `undefined` means neither was given.
 */
export async function resolveBody(
  contentSource: string | undefined,
  filePath: string | undefined,
): Promise<string | undefined> {
  if (contentSource !== undefined && filePath !== undefined) {
    throw new Error('Provide either contentSource or filePath, not both.');
  }
  return filePath !== undefined ? readTextFromPath(filePath) : contentSource;
}
