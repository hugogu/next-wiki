import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

interface SpecParameter {
  in: string;
  name: string;
  example?: unknown;
  schema?: { type?: string; format?: string; enum?: unknown[]; pattern?: string };
}

/**
 * Checks the committed public/openapi.json, not the generator: next-openapi-gen
 * picks path-parameter examples by name, and scripts/finalize-openapi.mjs must
 * replace the ones the declared schema rejects.
 */
const spec = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public', 'openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, { parameters?: SpecParameter[] }>>;
};

const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch']);

const pathParamsWithExamples = Object.entries(spec.paths).flatMap(([route, item]) =>
  Object.entries(item)
    .filter(([method]) => METHODS.has(method))
    .flatMap(([method, operation]) =>
      (operation.parameters ?? [])
        .filter((param) => param.in === 'path' && 'example' in param)
        .map((param) => ({ label: `${method.toUpperCase()} ${route} {${param.name}}`, param })),
    ),
);

function acceptsExample({ example, schema = {} }: SpecParameter): boolean {
  if (schema.enum) return schema.enum.includes(example);
  if (schema.pattern) return new RegExp(schema.pattern).test(String(example));
  if (schema.format === 'uuid') return typeof example === 'string' && z.string().uuid().safeParse(example).success;
  if (schema.type === 'integer') return Number.isInteger(example);
  return true;
}

describe('generated openapi.json', () => {
  it('covers enum-typed path parameters (guards against the check finding nothing)', () => {
    expect(pathParamsWithExamples.some(({ param }) => param.schema?.enum)).toBe(true);
  });

  it('gives every path parameter an example its own schema accepts', () => {
    const rejected = pathParamsWithExamples.filter(({ param }) => !acceptsExample(param)).map(({ label }) => label);
    expect(rejected).toEqual([]);
  });
});
