import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

interface SpecParameter {
  in: string;
  name: string;
  example?: unknown;
  required?: boolean;
  description?: string;
  schema?: { type?: string; format?: string; enum?: unknown[]; pattern?: string };
}

/**
 * Checks the committed public/openapi.json, not the generator: next-openapi-gen
 * picks path-parameter examples by name, and scripts/finalize-openapi.mjs must
 * replace the ones the declared schema rejects.
 */
interface SpecSchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, SpecSchema>;
  required?: string[];
}

const spec = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public', 'openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, { parameters?: SpecParameter[] }>>;
  components: { schemas: Record<string, SpecSchema> };
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


describe('AI attribution OpenAPI parameters', () => {
  it.each(['get', 'post'])('declares the clearance page UUID for %s', (method) => {
    const operation = spec.paths['/v1/pages/{id}/ai-attribution/clearances']?.[method];
    const parameter = operation?.parameters?.find((item) => item.in === 'path' && item.name === 'id');
    expect(parameter).toMatchObject({ required: true, schema: { type: 'string', format: 'uuid' } });
    expect(acceptsExample(parameter!)).toBe(true);
  });

  it.each(['/v1/search/pages', '/v1/memory/wiki/search'])('documents optional AI query flags on %s', (route) => {
    for (const name of ['includeAiGenerated', 'includeAiAssisted']) {
      const parameter = spec.paths[route]?.get?.parameters?.find((item) => item.in === 'query' && item.name === name);
      expect(parameter).toMatchObject({ required: false, schema: { type: 'boolean' } });
      expect(parameter?.description).toContain('defaults to true');
    }
  });

  it.each(['HybridSearchQueryInput', 'PublicSemanticSearchSubmitInput'])('documents AI body flags in %s', (name) => {
    const schema = spec.components.schemas[name];
    for (const flag of ['includeAiGenerated', 'includeAiAssisted']) {
      expect(schema?.properties?.[flag]).toMatchObject({ type: 'boolean', description: expect.stringContaining('defaults to true') });
      expect(schema?.required ?? []).not.toContain(flag);
    }
  });

  it('requires the reviewed revision UUID and exposes durable clearance timestamps and versions', () => {
    const input = spec.components.schemas.AiAttributionClearanceInput;
    expect(input?.required).toContain('expectedRevisionId');
    expect(input?.properties?.expectedRevisionId).toMatchObject({ type: 'string', format: 'uuid', description: expect.stringContaining('STALE_REVISION (409)') });
    const record = spec.components.schemas.AiAttributionClearance;
    expect(record?.properties?.versionNumber).toMatchObject({ type: 'integer' });
    expect(record?.properties?.clearedAt).toMatchObject({ type: 'string', format: 'date-time' });
  });
});
