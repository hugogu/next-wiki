# Web Research HTTP Contract

This document defines the additive authenticated API contract. All error bodies
use the existing application error envelope and stable code. Credentials,
extracted source body, connector response payloads, and request query text are
never exposed by administration endpoints.

## Authorization

| Surface | Required authority |
|---|---|
| Chat web research | Signed-in session actor, normal AI-question access, webResearchEnabled entitlement, active deployment service, user consent. |
| Settings and connection test | Administrator with manage_ai. |
| Source capture | Source-action owner with existing Raw evidence-create authority. |
| All listed endpoints | No anonymous or API-key access in v1. |

## Research settings

### GET /api/ai/web-research/settings

Returns the effective deployment configuration to an administrator.

Response 200:

~~~json
{
  "enabled": true,
  "provider": "tavily",
  "credentialConfigured": true,
  "allowedDomains": ["docs.example.com"],
  "blockedDomains": ["untrusted.example"],
  "limits": {
    "maxSearchesPerTurn": 2,
    "maxCandidatesPerSearch": 5,
    "maxOpenedSourcesPerTurn": 3,
    "maxSourceChars": 16000,
    "timeoutMs": 10000
  },
  "lastConnectionTest": {
    "status": "succeeded",
    "completedAt": "2026-08-24T10:00:00.000Z"
  }
}
~~~

### PATCH /api/ai/web-research/settings

Creates or updates the singleton configuration. Unknown provider identifiers,
invalid domains, invalid range values, or a request to enable without a
credential return validation errors. A supplied apiKey replaces the encrypted
key but is never returned.

Request:

~~~json
{
  "enabled": true,
  "provider": "tavily",
  "apiKey": "optional-replacement-secret",
  "allowedDomains": ["docs.example.com"],
  "blockedDomains": ["untrusted.example"],
  "limits": {
    "maxSearchesPerTurn": 2,
    "maxCandidatesPerSearch": 5,
    "maxOpenedSourcesPerTurn": 3,
    "maxSourceChars": 16000,
    "timeoutMs": 10000
  }
}
~~~

Response: 200 with the GET representation, omitting apiKey.

## Connection-test action

### POST /api/ai/web-research/connection-tests

Runs a bounded connector test synchronously using the saved configuration. It
does not create a page, save external body content, or disclose results beyond
safe status/error detail. The returned terminal `actionId` is retained only
for audit/history correlation.

Response 200:

~~~json
{
  "ok": true,
  "status": "succeeded",
  "provider": "tavily",
  "latencyMs": 42,
  "candidateCount": 1,
  "testedAt": "2026-08-24T10:00:00.000Z",
  "actionId": "UUID"
}
~~~

## Question extension

### POST /api/ai/questions

Keep all existing question fields. Add this optional object:

~~~json
{
  "research": {
    "mode": "wiki_only",
    "externalResearchConsent": false
  }
}
~~~

For wiki_first_web, externalResearchConsent must be true. The UI obtains it only
after displaying the configured service disclosure. The server may accept the
mode yet complete Wiki-only if existing Wiki evidence is sufficient; it never
performs egress for wiki_only.

The action view and conversation/session metadata include the chosen mode,
allowing browser URL restoration and historical rendering. They contain safe
citation metadata only.

## Source capture action

### POST /api/ai/web-research/sources/{sourceId}/capture

Captures one opened, unexpired external source into the existing Raw
original-source system. The `actionId` is supplied in the JSON request body.

Request:

~~~json
{
  "actionId": "UUID"
}
~~~

Response 201:

~~~json
{
  "pageId": "UUID",
  "versionId": "UUID",
  "rawPath": "web-evidence/{sourceId}"
}
~~~

The request is idempotent. For an already captured source, the response returns
the existing Raw page and revision identifiers and does not create a duplicate
entry.

## Stable error codes

| Code | Meaning / safe client behavior |
|---|---|
| WEB_RESEARCH_UNAVAILABLE | Service is disabled, unconfigured, or unavailable; keep Wiki-only path usable. |
| WEB_RESEARCH_ACCESS_DENIED | Actor/entitlement cannot use web research; reveal no configuration. |
| WEB_RESEARCH_CONSENT_REQUIRED | Web mode lacked recorded disclosure confirmation; show disclosure again. |
| WEB_RESEARCH_POLICY_BLOCKED | Domain/global/request policy disallowed retrieval. |
| WEB_RESEARCH_BUDGET_EXCEEDED | Search/open/time/source budget ended; show bounded-answer limitation. |
| WEB_RESEARCH_CANCELLED | Action was cancelled before another outbound call. |
| WEB_SOURCE_NOT_FOUND | Source ID is absent or not owned by the requested action. |
| WEB_SOURCE_EXPIRED | Temporary source data has expired and cannot be opened/captured. |
| WEB_SOURCE_UNCAPTURABLE | Body/status/permission prevents preservation; do not create a Raw record. |

## OpenAPI and compatibility

All changed routes and shared request/response schemas must be represented in
the project OpenAPI source declarations. Regenerate apps/web/public/openapi.json
using the existing openapi:generate command; do not hand-edit generated output.
Existing question clients that omit research continue to receive wiki_only
behavior. Existing persisted citations without a kind continue to render as Wiki
citations.
