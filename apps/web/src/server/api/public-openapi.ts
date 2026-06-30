type OpenApiDocument = {
  openapi: string;
  info: Record<string, unknown>;
  servers?: unknown;
  tags?: Array<{ name: string; [key: string]: unknown }>;
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const PUBLIC_PATH_PREFIX = '/v1/';
const COMPONENT_SCHEMA_REF_PREFIX = '#/components/schemas/';

function collectSchemaRefs(value: unknown, refs: Set<string>) {
  if (!value || typeof value !== 'object') return;

  if ('$ref' in value && typeof value.$ref === 'string' && value.$ref.startsWith(COMPONENT_SCHEMA_REF_PREFIX)) {
    refs.add(value.$ref.slice(COMPONENT_SCHEMA_REF_PREFIX.length));
  }

  for (const child of Object.values(value)) {
    collectSchemaRefs(child, refs);
  }
}

function collectReferencedSchemas(
  schemas: Record<string, unknown>,
  seed: Iterable<string>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  const queue = Array.from(seed);
  const seen = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);

    const schema = schemas[name];
    if (!schema) continue;
    selected[name] = schema;

    const nested = new Set<string>();
    collectSchemaRefs(schema, nested);
    for (const ref of nested) {
      if (!seen.has(ref)) queue.push(ref);
    }
  }

  return selected;
}

export function toPublicOpenApiDocument(source: OpenApiDocument): OpenApiDocument {
  const paths = Object.fromEntries(
    Object.entries(source.paths).filter(([pathname]) => pathname.startsWith(PUBLIC_PATH_PREFIX)),
  );

  const schemaRefs = new Set<string>();
  collectSchemaRefs(paths, schemaRefs);

  const sourceComponents = source.components ?? {};
  const sourceSchemas = sourceComponents.schemas ?? {};
  const schemas = collectReferencedSchemas(sourceSchemas, schemaRefs);

  return {
    ...source,
    info: {
      ...source.info,
      title: 'Next Wiki Public API',
      description: 'Public Wiki Content API for external tools and automation.',
    },
    tags: [{ name: 'Public Wiki Content' }],
    paths,
    components: {
      securitySchemes: sourceComponents.securitySchemes ?? {},
      schemas,
    },
  };
}
