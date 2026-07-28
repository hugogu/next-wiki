# MCP Tool Contract

The MCP server is a thin client of the public REST contract. It must not access database, provider, or object storage directly.

## Tool Surface

| Tool | Input | Output | REST mapping |
| --- | --- | --- | --- |
| `upload_image` (existing) | `imageBase64`, `filename`, `mimeType` | Existing public asset ID, content URL, Markdown | `POST /api/v1/assets` |
| `generate_image` | `pageId`, `revisionId`, `source`, optional `aspectRatio` | Queued image action ID, status, poll URL | `POST /api/v1/ai/images` |
| `get_image_generation` | `actionId` | Safe action status; when ready, artifact ID/metadata and preview/promotion/discard URLs | `GET /api/v1/ai/images/{actionId}` |
| `promote_generated_image` | `artifactId`, `pageId` | Standard public asset ID, content URL, Markdown | `POST /api/v1/ai/generated-artifacts/{artifactId}/asset` |

## Input Shapes

```ts
type ImageSource =
  | { kind: "page" }
  | { kind: "selection"; text: string; hash: string };

type GenerateImageInput = {
  pageId: string;
  revisionId: string;
  source: ImageSource;
  aspectRatio?: string;
};
```

The MCP schema mirrors the REST schema. It must reject unspecified remote URLs, source image data, image-editing fields, and batch arrays.

## Behavioral Rules

- `generate_image` is asynchronous. A successful invocation means the request was accepted, not that a provider image is already available.
- `get_image_generation` is the polling mechanism. Its `failed` response exposes only the safe REST error; it never serializes image bytes or provider diagnostics.
- `promote_generated_image` is idempotent: if the artifact was already promoted, return the same public asset/Markdown result.
- Callers that already use `upload_image` keep its input/output names and behavior. No compatibility rename or removal is allowed.
- Tool descriptions state that promotion uploads a private reusable asset but does not modify or publish a Wiki page. Callers must use their normal page-edit workflow to insert returned Markdown.
- HTTP errors are mapped to the MCP package’s existing structured tool-error representation with the REST safe code/message preserved.

## Implementation Touchpoints and Tests

Extend `api-client.ts` with typed image lifecycle calls, `shapes.ts` with REST response guards, `tool-metadata.ts`/`server.ts` with explicit registrations, and `src/tools/` with isolated handlers. Update client, schema, metadata/discovery, and handler tests. Keep the package README’s tool list and authentication/scopes section synchronized with the generated OpenAPI contract.
