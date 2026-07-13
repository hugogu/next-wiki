# Implementation Plan: Unified UI Localization

**Branch**: `codex/016-next-intl-migration` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-next-intl-migration/spec.md`

## Summary

Replace the hand-rolled UI localization runtime with next-intl while retaining
English and Chinese UI coverage, existing user locale preferences, and all
current URLs. The design deliberately uses next-intl without locale routing:
`/{language}/{path}` already identifies AI-generated *content* translations,
not UI variants. A single locale resolver will align dynamic server UI,
metadata, and client UI; the public reader retains its cache-safe static/ISR
representation and localizes only personalized controls after delivery.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+; Next.js 16.2.9; React 19.2.7

**Primary Dependencies**: Next.js App Router; next-intl 4.x; FormatJS locale
matcher; TanStack Query; Zod; existing shared preference schemas

**Storage**: Existing PostgreSQL `users.locale_preference` field only; existing
visitor preference cookie (`next-wiki-locale`); no schema migration

**Testing**: Vitest 3 component/unit tests; Playwright E2E; Next production
build and static/ISR regression checks

**Target Platform**: Modern browsers; self-hosted Node.js application in Docker
Compose or Kubernetes

**Project Type**: Turborepo web application (`apps/web`), with a Next.js App
Router frontend and REST route handlers

**Performance Goals**: Preserve the public reader's 300-second ISR cadence;
avoid shipping both 1,112-message language catalogs to a client screen; keep
language change visually consistent after the associated refresh/navigation

**Constraints**: No UI locale path prefix, redirect, locale-aware routing
middleware, or locale navigation helper; existing public and content-translation
URLs, cache tags, and OpenAPI preference schemas remain compatible; UI locale
may not make public document HTML or public SEO metadata vary per request

**Scale/Scope**: Migrate 1,112 English/Chinese messages (about 55 legacy
interpolations), 89 client import sites, 39 server import sites, and 15 callers
that directly depend on custom localization types; preserve two UI locales in
this release

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / mandate | Design response | Gate |
|---|---|---|
| P1: Simple deployment | next-intl and the locale matcher are application dependencies only; no new service, queue, database, or setup step is introduced. | Pass |
| P5: Permissions | Preference persistence remains behind the existing authenticated preference permission; public locale controls do not expose user or content-translation state. | Pass |
| P6: UI consistency | All migrated visible labels, accessibility text, status messages, and formatted values use the shared localization boundary; styling is unchanged. | Pass |
| P9: Open standards | Existing REST/OpenAPI preference contract remains backward compatible; locale values remain `en` and `zh`. | Pass |
| P10: Explicit registration | Locale configuration, resolver, catalogs, formats, and message typing have explicit registered entry points; there is no filesystem scanning at runtime. | Pass |
| P11: Navigation | UI locale changes do not add, rewrite, or redirect user-facing URLs. Existing `/{language}/{path}` retains its single content-translation meaning. | Pass |
| P12: Public content delivery | Cookie/header/user-preference resolution is isolated from static public reader document rendering. Public document content and metadata use cache-safe inputs; personalized controls hydrate after delivery. | Pass, with mandatory ISR regression validation |

**Pre-design gate result**: Pass. The principal risk is accidentally invoking a
cookie-dependent request configuration from a layout shared by the public ISR
reader. Phase 0 resolves this with a distinct dynamic application localization
boundary and a static public boundary.

**Post-design gate result**: Pass. The selected design does not change public
content data, cache tags, reader URLs, permissions, database schema, or
deployment footprint. The public and dynamic boundaries are explicit in
[research.md](./research.md), [data-model.md](./data-model.md), and the UI
contract.

## Project Structure

### Documentation (this feature)

```text
specs/016-next-intl-migration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-localization.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── layout.tsx                           # cache-safe document/layout boundary
│   ├── (public)/                            # static/ISR reader routes; no UI-locale routing
│   ├── (admin)/                             # dynamic authenticated UI
│   └── (user)/                              # dynamic authenticated UI
├── messages/
│   ├── en.json                              # typed UI message catalog
│   └── zh.json                              # typed UI message catalog
├── src/
│   ├── i18n/
│   │   ├── config.ts                         # finite UI-locale registry/default/cookie
│   │   ├── resolve.ts                        # explicit validated resolver
│   │   ├── request.ts                        # dynamic next-intl request configuration
│   │   ├── formats.ts                        # date/number/relative-time presets
│   │   └── types.ts                          # next-intl type augmentation
│   ├── components/
│   │   ├── i18n/                             # locale switcher and client boundary
│   │   ├── renderer/                         # code/mermaid island locale propagation
│   │   └── layout/                           # public vs application shell boundaries
│   └── server/
│       ├── services/user-center.ts           # existing preference persistence
│       └── cache/public-cache.ts             # unchanged content cache invalidation
├── next.config.ts                            # next-intl plugin composition
├── proxy.ts                                  # audit proxy; not used for UI locale routing
├── test/                                     # Vitest setup and helpers
└── e2e/                                      # Playwright end-to-end coverage
packages/shared/src/user-center.ts            # unchanged locale-preference schema
CLAUDE.md                                     # managed Spec Kit context reference
```

**Structure Decision**: Keep UI localization in `apps/web`; it is not a shared
domain model and must not be conflated with `pages.locale`,
`translation_languages`, or `packages/shared` content-translation types. The
existing `src/i18n/locales/*.ts` and bespoke provider are retired only after all
consumers have moved to the explicit next-intl entry points.

## Complexity Tracking

No constitutional violations or additional architectural complexity require
justification.
