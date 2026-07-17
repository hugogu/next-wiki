# Model detector fixtures

Deterministic sample payloads for detector unit tests. No real OpenRouter or
Cloudflare network calls are made — tests stub `fetch` and feed these shapes.

## OpenRouter

`GET https://openrouter.ai/api/v1/models` and `.../embeddings/models` return
`{ data: OpenRouterModel[] }` where a model carries `architecture.input_modalities`,
`architecture.output_modalities`, `supported_parameters`, `context_length`,
`top_provider.{context_length,max_completion_tokens}`, and `embedding_dimensions`.

## Cloudflare

- Model search: `GET /accounts/{account_id}/ai/models/search` returns
  `{ result: CloudflareModel[], success, errors }` where a model carries
  `name` (e.g. `@cf/meta/llama-3.1-8b-instruct`), `description`, `task.name`
  (e.g. `Text Generation`, `Text Embeddings`, `Text-to-Image`), and
  `properties` (list of `{ property_id, value }`, including
  `{ property_id: "beta", value: "true" }` for experimental models).
- Model schema: `GET /accounts/{account_id}/ai/models/schema?model={name}`
  returns `{ result: { input: JSONSchema, output: JSONSchema }, success }`.
  Input/output JSON schemas describe the model's request/response shape; the
  detector inspects property names/formats to infer modalities.

Sample shapes live inline in `cloudflare.test.ts` / `openrouter.test.ts` via
`test-helpers.ts`.
