# Contract: Provider-Neutral Tool-Call Envelope

**Satisfies**: FR-001 – FR-009, SC-001, SC-002

This is the contract every AI provider adapter must satisfy. It is enforced by a
shared conformance suite, not by convention.

---

## 1. Schemas (`packages/shared/src/ai-tools.ts`)

```ts
neutralToolDefinition = {
  name: string,            // ^[a-z0-9_]{1,64}$
  description: string,     // 1..1024
  inputSchema: JsonSchema, // object schema; no $ref, no remote refs
}

neutralToolCall = {
  id: string,              // adapter-assigned when the provider omits one
  name: string,
  arguments: Record<string, unknown>,  // already parsed
}

neutralToolResult = {
  callId: string,
  ok: boolean,
  content: string,         // bounded summary produced by the runtime
  isError: boolean,
}
```

`arguments` is a parsed object, never a JSON string. An adapter that cannot parse
the provider's argument payload throws
`AiProviderError('INVALID_RESPONSE', …)`; it MUST NOT emit a partially parsed
call.

---

## 2. Adapter surface (`apps/web/src/server/ai/types.ts`)

```ts
interface AiProviderAdapter {
  readonly supportsNativeTools: boolean;   // NEW
  streamText(input: TextGenerationInput): AsyncIterable<TextGenerationEvent>;
  // …existing members unchanged
}

TextGenerationInput += {
  tools?: NeutralToolDefinition[];
}

TextGenerationInput.messages[] += {
  toolCalls?: NeutralToolCall[];     // on an assistant message
  toolResults?: NeutralToolResult[]; // on a user/tool message
}

TextGenerationEvent |= { type: 'tool_call'; call: NeutralToolCall }
```

`supportsNativeTools` is a static property of the adapter class, not of the
configured model. Model-level selection is `ai_models.tool_call_strategy`.

---

## 3. Behavioural requirements

Every adapter with `supportsNativeTools === true` MUST:

| ID | Requirement |
|---|---|
| TC-01 | When `tools` is absent or empty, behave exactly as today — no tool field on the wire, no `tool_call` events. |
| TC-02 | Translate each `NeutralToolDefinition` into the provider's tool declaration without dropping `description` or any `inputSchema` property. |
| TC-03 | Emit exactly one `tool_call` event per completed provider tool call, after its arguments are complete. Partial argument fragments are buffered, never emitted. |
| TC-04 | Assign a stable `id` when the provider does not supply one, and use the provider's id when it does, so results can be correlated. |
| TC-05 | Serialise `toolResults` back in the provider's expected position and shape, preserving `callId` correlation. |
| TC-06 | Continue to emit `delta`, `usage`, `provider_request_id`, and `done` events unchanged during a tool turn. |
| TC-07 | Map a provider rejection of the tool payload to `AiProviderError` with a code the strategy resolver can recognise as a tool-support failure. |
| TC-08 | Honour `abortSignal` mid-tool-call: abort surfaces as `CANCELLED`, and no partial `tool_call` is emitted. |
| TC-09 | Never place credentials, raw provider payloads, or hidden content into an error message (existing `sanitizeProviderMessage` discipline). |

Adapters with `supportsNativeTools === false` MUST reject a `streamText` call
carrying a non-empty `tools` array with `CAPABILITY_UNSUPPORTED` rather than
silently ignoring it.

---

## 4. Conformance suite

Extends `apps/web/src/server/ai/providers/provider-conformance.test.ts`, driven
by the existing `test/ai-provider-fixture` with tool-capable response fixtures.
The suite runs the same table against every adapter that declares native tool
support, so adding a provider means adding one line, not a new test file.

Required cases: TC-01 through TC-09 above, plus:

- A turn with two tool calls in one assistant message yields two `tool_call`
  events in order.
- A tool call whose arguments arrive across several stream chunks yields one
  event with complete arguments.
- Submitting `toolResults` for a prior turn produces a valid follow-up request
  (asserted against the fixture's recorded request body).

---

## 5. Planner equivalence

Both planners in `ai-tool-planners.ts` return the existing `ToolPlanStep`:

```ts
type ToolPlanStep =
  | { kind: 'tool_calls'; calls: PlannedToolCall[] }
  | { kind: 'final'; text: string };
```

`createTextProtocolPlanner` is today's behaviour, moved out of
`jobs/ai-question.ts` unchanged: fenced YAML/JSON, `MAX_TOOL_PROTOCOL_RETRIES`
retries on malformed output, `extractTaggedThinking` for reasoning.

`createNativeToolPlanner` maps `listToolDefinitions()` (filtered by `isEnabled`)
into `NeutralToolDefinition[]`, streams with `tools` set, and converts
`tool_call` events into `PlannedToolCall[]`. A turn with no tool calls and
non-empty text is `{ kind: 'final' }`.

**Equivalence requirement (FR-004)**: an integration test runs the same scripted
scenario through both planners against fixtures and asserts identical
`ai_tool_calls` rows, identical emitted chat events, identical review decisions,
and identical final citations. Only the provider request bodies differ.

---

## 6. Review-decision carriage

The text protocol lets the model request review inline (`review: admin_review`).
Native tool calls have no such field. The native planner therefore passes
`requestedReview: 'none'` for every call, and the server-side
`resolveReview(tool, requested)` decides — which is already the strictest-wins
authority (`ai-tool-policy.ts`).

This is a deliberate, safe asymmetry: a model can only ever request *more* review
than policy requires, never less, so dropping the request under native tool
calling cannot weaken governance. It is called out here so the difference is not
mistaken for a bug.
