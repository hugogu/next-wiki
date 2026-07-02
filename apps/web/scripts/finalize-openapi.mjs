import fs from 'node:fs';
import path from 'node:path';

const openapiPath = path.resolve(process.cwd(), 'public', 'openapi.json');
const document = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

// Keep this script as a narrow finalizer for generated output. Request bodies,
// responses, query params, and schemas must come from route annotations and
// Zod definitions in src/server/api/openapi-schemas.ts.
const preferredSchemaNames = new Set([
  'PublicAssetResource',
  'PublicAssetUploadResult',
  'PublicDraftCreateInput',
  'PublicPageCreateInput',
  'PublicPageListQuery',
  'PublicPageListResponse',
  'PublicPagePropertiesInput',
  'PublicPageResource',
  'PublicPageSearchQuery',
  'PublicPageSearchResponse',
  'PublicPublicationInput',
  'PublicRevisionListQuery',
  'PublicRevisionListResponse',
  'PublicRevisionResource',
  'PublicSearchResult',
]);

function toPreferredSchemaName(name) {
  if (!name.startsWith('public') || !name.endsWith('Schema')) return null;
  const baseName = name.slice(0, -'Schema'.length);
  const preferred = `${baseName[0].toUpperCase()}${baseName.slice(1)}`;
  return preferredSchemaNames.has(preferred) ? preferred : null;
}

function rewriteSchemaRefs(value) {
  if (!value || typeof value !== 'object') return;

  if (typeof value.$ref === 'string') {
    const match = value.$ref.match(/^#\/components\/schemas\/(.+)$/);
    const replacement = match ? toPreferredSchemaName(match[1]) : null;
    if (replacement) value.$ref = `#/components/schemas/${replacement}`;
  }

  for (const child of Object.values(value)) {
    rewriteSchemaRefs(child);
  }
}

function removeDuplicatePublicSchemaAliases() {
  const schemas = document.components?.schemas;
  if (!schemas) return;

  for (const name of Object.keys(schemas)) {
    const preferred = toPreferredSchemaName(name);
    if (preferred && schemas[preferred]) delete schemas[name];
  }
}

function operation(pathname, method) {
  return document.paths?.[pathname]?.[method];
}

function setMultipartAssetRequest(target) {
  target.requestBody = {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file'],
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: 'Image file to upload.',
            },
          },
        },
      },
    },
  };
}

function setBinaryAssetResponse(target) {
  target.responses = {
    '200': {
      description: 'Asset bytes.',
      content: {
        'image/png': { schema: { type: 'string', format: 'binary' } },
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
        'image/gif': { schema: { type: 'string', format: 'binary' } },
        'image/webp': { schema: { type: 'string', format: 'binary' } },
        'image/svg+xml': { schema: { type: 'string', format: 'binary' } },
        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
      },
    },
  };
}

rewriteSchemaRefs(document.paths);
removeDuplicatePublicSchemaAliases();

const uploadAsset = operation('/v1/assets', 'post');
if (uploadAsset) setMultipartAssetRequest(uploadAsset);

const getAssetContent = operation('/v1/assets/{id}/content', 'get');
if (getAssetContent) setBinaryAssetResponse(getAssetContent);

const UUID_EXAMPLE = '550e8400-e29b-41d4-a716-446655440000';

function fixPathParamExamples() {
  for (const pathItem of Object.values(document.paths || {})) {
    for (const op of Object.values(pathItem || {})) {
      if (!op || typeof op !== 'object' || !Array.isArray(op.parameters)) continue;
      for (const param of op.parameters) {
        if (param.in !== 'path' || !param.schema || typeof param.schema !== 'object') continue;
        const schema = param.schema;
        if (schema.format === 'uuid') {
          param.example = UUID_EXAMPLE;
        } else if ((schema.type === 'integer' || schema.type === 'number') && typeof param.example !== 'number') {
          param.example = schema.minimum && typeof schema.minimum === 'number' ? schema.minimum : 1;
        }
      }
    }
  }
}

fixPathParamExamples();

fs.writeFileSync(openapiPath, `${JSON.stringify(document, null, 2)}\n`);
