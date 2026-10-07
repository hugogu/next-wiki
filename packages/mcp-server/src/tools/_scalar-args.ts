import { z } from 'zod';

/**
 * Argument helpers for tool inputs that are not strings.
 *
 * Some MCP hosts forward an agent's arguments with every scalar spelled as a
 * string (`version: "2"`, `dryRun: "false"`), and the host or the model may be
 * the one doing it. The server cannot tell which, so it accepts the exact
 * spelling of the value it asked for and still validates the converted value.
 *
 * Deliberately not `z.coerce`: that turns `""` and `null` into 0 and `"false"`
 * into `true`. Only a plain decimal or `true`/`false` converts; anything else
 * reaches the schema untouched and is rejected by it.
 *
 * The advertised JSON Schema does not change: a preprocess is described by the
 * schema it wraps, so clients still see integer / number / boolean.
 */
const DECIMAL = /^-?\d+(\.\d+)?$/;

export const numberArg = (schema: z.ZodNumber) =>
  z.preprocess((value) => (typeof value === 'string' && DECIMAL.test(value) ? Number(value) : value), schema);

export const booleanArg = () =>
  z.preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean());
