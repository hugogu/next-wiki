# Feature Specification: Web Analytics Integrations

**Feature Branch**: `024-analytics-integrations`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "提供网站访问分析供应商的集成，比如百度统计和Google Analytics。在后台提供相应的配置页面。一般而言每个供应商都都有一个Tracking ID需要配置。每个供应商需要有独立的集成启用及关闭的开关。注意供应商集成所需要的脚本，需要注入到所有的页面中（这应该是框架层的功能，肯定不能在每个页面单独处理。）"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Analytics Providers as an Administrator (Priority: P1)

As a system administrator, I want a single admin area where I can configure
multiple web analytics providers - initially Baidu Tongji (百度统计) and Google
Analytics - each with its own Tracking ID and its own on/off switch, so that I can
independently enable, disable, or reconfigure each provider without affecting
the others.

**Why this priority**: The configuration surface is the entry point for the
entire feature. Without it no Tracking ID can be captured, no script can be
safely injected, and no per-provider control exists. It is the smallest
independently useful slice.

**Independent Test**: An administrator opens the analytics configuration area,
sees Baidu Tongji and Google Analytics listed as available providers, enters a
Tracking ID for one, enables it, leaves the other disabled with no Tracking ID,
saves, and confirms that only the enabled provider's settings are persisted and
active.

**Acceptance Scenarios**:

1. **Given** an administrator on the analytics configuration page, **When** they
   enter a valid Tracking ID for Baidu Tongji and toggle it on, **Then** the
   configuration is saved, Baidu Tongji is marked enabled, and Google Analytics
   remains disabled and unchanged.
2. **Given** an administrator has enabled Baidu Tongji, **When** they toggle it
   off and save, **Then** Baidu Tongji is disabled, its Tracking ID is retained
   (so it can be re-enabled without re-entering it), and no Baidu Tongji script
   is delivered to pages.
3. **Given** an administrator enters an invalid or empty Tracking ID for a
   provider, **When** they attempt to enable that provider, **Then** the system
   rejects the change with a clear validation message and the provider remains
   disabled.
4. **Given** a non-admin user (editor, reader, or anonymous visitor), **When**
   they attempt to open the analytics configuration page, **Then** access is
   denied and no provider credentials are exposed.
5. **Given** an administrator views the analytics configuration page, **When**
   both providers are disabled, **Then** the system clearly indicates that no
   analytics is being collected and no third-party scripts will be loaded.

---

### User Story 2 - Automatic Framework-Level Script Injection on Every Page (Priority: P1)

As the system, I need the active analytics providers' tracking scripts to be
injected into every rendered page (reader, editor, admin, auth, chat, public
and private) through a single framework-level injection point - never by
per-page code - so that coverage is complete, consistent, and maintainable.

**Why this priority**: This is the contract that makes the configuration real.
Without a single framework-level injection point, the feature cannot satisfy the
explicit constraint that scripts must appear on all pages without per-page
handling, and adding a new page would silently miss analytics coverage.

**Independent Test**: With Baidu Tongji enabled and a valid Tracking ID saved,
open the reader page, the editor, an admin page, and the public home page; in
every case the Baidu Tongji script is present in the rendered HTML, configured
with the saved Tracking ID. Disable Baidu Tongji and refresh: the script is
absent on every page. Add a new page/route without any analytics-specific code
and confirm the script still appears when the provider is enabled.

**Acceptance Scenarios**:

1. **Given** at least one analytics provider is enabled with a valid Tracking
   ID, **When** any page of the product is rendered (reader, editor, admin,
   auth, chat, public or private), **Then** that provider's tracking script is
   present in the delivered HTML exactly once, configured with the saved
   Tracking ID.
2. **Given** multiple providers are enabled, **When** a page is rendered,
   **Then** each enabled provider's script is present, independent of the
   others, and in a stable, predictable order.
3. **Given** a provider is disabled, **When** any page is rendered, **Then**
   that provider's script is absent and no empty placeholder remains.
4. **Given** a new page or route is added to the product, **When** it is opened
   with an enabled provider, **Then** the analytics script is present without
   the new page having to reference analytics in its own code.
5. **Given** the analytics script injection point is the single framework-level
   location, **When** a code audit is performed, **Then** no page-level
   component injects analytics scripts directly.

---

### User Story 3 - Public/Anonymous Pages Respect Static Delivery and Caching (Priority: P2)

As an operator, I need analytics scripts on anonymously-readable, statically
delivered public pages to remain compatible with static and incrementally
statically regenerated (ISR) content delivery - the script must be part of the
cached document without varying by session - while personalized controls stay
outside the cacheable body.

**Why this priority**: Public reading is static by default (constitutional
mandate). The analytics script is the same for every visitor and therefore
belongs in the static document body, but the delivery mechanism must not be
broken by session-dependent variation.

**Independent Test**: With a provider enabled, request the same public page as
an anonymous visitor twice; both responses are served from the same cached
representation and contain the same analytics script. Verify the cached HTML
contains the analytics script and no session-dependent variation is introduced.

**Acceptance Scenarios**:

1. **Given** an anonymously readable, published page with an enabled analytics
   provider, **When** an anonymous visitor requests it, **Then** the delivered
   HTML includes the analytics script and the response is served from the
   static/ISR cache without a database query or session lookup per request.
2. **Given** an analytics provider is enabled or disabled, **When** the
   configuration change is saved, **Then** the affected public pages are
   revalidated so subsequent requests serve the updated representation with or
   without the provider's script as appropriate.
3. **Given** an authenticated editor views a public page, **When** the page is
   delivered, **Then** the analytics script in the cached document is the same
   as the one delivered to an anonymous visitor; any personalized controls
   remain outside the cached document body.

---

### User Story 4 - Add or Replace an Analytics Provider Without Code Changes (Priority: P3)

As a system maintainer, I want the analytics integration layer to be pluggable
so that adding a new analytics provider, or replacing the script shape of an
existing one, is a bounded registration change - never a per-page edit.

**Why this priority**: This makes the feature future-proof. New vendors (Matomo,
Plausible, Umami, etc.) can be registered without touching page code, preserving
the framework-level injection contract.

**Independent Test**: Register a new provider behind the analytics integration
contract with its own Tracking ID field and script template; an administrator
enables it, and its script appears on all pages without any page component being
edited.

**Acceptance Scenarios**:

1. **Given** a new analytics provider is registered behind the integration
   contract, **When** an administrator opens the configuration page, **Then**
   the provider appears alongside the built-in ones with its own enable switch
   and Tracking ID field.
2. **Given** the newly registered provider is enabled with a valid Tracking ID,
   **When** any page is rendered, **Then** its script is injected by the same
   framework-level mechanism as the built-in providers.
3. **Given** the built-in providers and any additionally registered providers,
   **When** they are enabled together, **Then** all of their scripts are
   delivered together without interfering with each other.

---

### Edge Cases

- **No provider enabled**: When all providers are disabled, no analytics
  scripts are delivered on any page; the system indicates analytics is off.
- **Tracking ID cleared while provider is enabled**: An attempt to save an
  enabled provider with an empty or invalid Tracking ID is rejected; the prior
  valid configuration remains active until a valid value is provided or the
  provider is explicitly disabled.
- **Tracking ID contains unexpected characters**: Tracking IDs are validated
  against each provider's expected format; invalid values are rejected with a
  clear message and never reach the rendered script.
- **Configuration change while pages are cached**: Enabling, disabling, or
  changing a Tracking ID invalidates the affected public cache entries so
  visitors receive the updated representation rather than a stale script.
- **Provider script fails to load in the browser**: A failure in one provider's
  script must not break page rendering or prevent other enabled providers'
  scripts from running.
- **New page added by future development**: A new page or route automatically
  receives the active analytics scripts through the framework-level injection
  point without the new page's author doing anything.
- **Multiple providers enabled simultaneously**: All enabled providers' scripts
  are delivered together, in a stable order, and operate independently.
- **Administrator leaves Tracking ID populated but disables the provider**: The
  Tracking ID is retained in storage for later re-enablement; no script is
  delivered while the provider is disabled.

## Requirements *(mandatory)*

### Functional Requirements

#### Admin Configuration Surface (Story 1)

- **FR-001**: The system MUST provide an administrator-facing analytics
  configuration area where each available analytics provider is listed with its
  own enable/disable switch and its own Tracking ID field.
- **FR-002**: At launch, the system MUST include at least two built-in
  providers: Baidu Tongji (百度统计) and Google Analytics.
- **FR-003**: Each provider MUST be enabled or disabled independently; enabling
  or disabling one MUST NOT change the enabled state, Tracking ID, or
  configuration of any other provider.
- **FR-004**: The system MUST allow an administrator to save a Tracking ID for a
  provider regardless of whether the provider is enabled, so that a stored ID
  can be reused by toggling the provider on later.
- **FR-005**: The system MUST reject an attempt to enable a provider whose
  Tracking ID is empty or does not match the provider's expected format, while
  preserving the previously active configuration.
- **FR-006**: Access to the analytics configuration area and to reading or
  modifying Tracking IDs MUST be restricted to administrators; non-admin users,
  anonymous visitors, and API keys MUST be denied.
- **FR-007**: The system MUST NOT expose Tracking IDs or provider credentials to
  non-admin surfaces; they MUST only be used to render the corresponding script
  on pages.

#### Framework-Level Script Injection (Story 2)

- **FR-008**: The system MUST inject the tracking script of every enabled
  analytics provider into every rendered page in the product through a single,
  framework-level injection point.
- **FR-009**: The framework-level injection point MUST cover all surfaces of the
  product - reader, editor, admin, auth, chat, public and private - without any
  page-level component having to reference analytics.
- **FR-010**: When a provider is disabled, its tracking script MUST be absent
  from every rendered page, with no leftover placeholder or empty script tag.
- **FR-011**: When multiple providers are enabled, each provider's script MUST
  be present independently of the others, in a stable and predictable order.
- **FR-012**: Each rendered analytics script MUST be configured with the
  administrator-supplied Tracking ID for that provider at render time.
- **FR-013**: The injection mechanism MUST be located at the application layout
  / framework layer; a code audit MUST find zero per-page injection of analytics
  scripts.

#### Public Content Delivery & Caching (Story 3)

- **FR-014**: On anonymously readable, published pages, the analytics script
  MUST be part of the static/ISR document body and MUST NOT vary by session,
  cookie, or request header.
- **FR-015**: Enabling, disabling, or changing a Tracking ID for a provider
  MUST invalidate the affected public cache entries so subsequent requests
  reflect the updated script set.
- **FR-016**: Personalized controls on public pages MUST remain outside the
  cached document body; only the shared analytics script may live inside it.

#### Pluggable Provider Registration (Story 4)

- **FR-017**: The analytics integration layer MUST expose a bounded, explicit
  registration contract so that a new provider can be added as a single
  registration (Tracking ID field spec, script template, validation rules)
  without editing page components.
- **FR-018**: Each registered provider MUST declare its own Tracking ID
  validation rules and its own script template; the framework-level injection
  point MUST render every registered and enabled provider through the same
  contract.
- **FR-019**: Built-in providers (Baidu Tongji, Google Analytics) MUST be
  registered through the same contract as any additionally registered provider;
  they MUST NOT be hardcoded as special cases in page code.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- The page body of public, anonymously readable pages changes by the inclusion
  of one or more third-party analytics `<script>` tags delivered through the
  framework-level injection point. The script set is the same for every visitor
  and depends only on the administrator-configured provider state.
- The static/ISR cache representation includes the active analytics script(s)
  in the cached document body. The mutation that invalidates the affected public
  paths/cache tags is any change to an analytics provider's enabled state or
  Tracking ID. Personalized controls remain outside the cached document body, in
  line with the existing public-content delivery mandate.

### Key Entities *(include if feature involves data)*

- **Analytics Provider Registration**: A bounded, explicit registration that
  describes one analytics vendor - its stable identifier, human-readable name,
  expected Tracking ID format and validation rule, and the script template that
  will be rendered when the provider is enabled. Built-in registrations include
  Baidu Tongji and Google Analytics; additional providers can be registered
  through the same contract.
- **Analytics Provider Settings**: The site-wide, administrator-owned
  configuration for one provider - its enabled/disabled state and its configured
  Tracking ID. Settings persist independently per provider so that disabling one
  never discards another's Tracking ID, and a disabled provider retains its
  Tracking ID for later re-enablement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can independently enable Baidu Tongji, Google
  Analytics, or both, and confirm on three different page types (reader, editor,
  admin) that only the enabled providers' scripts are present, each carrying the
  saved Tracking ID.
- **SC-002**: An administrator can disable a provider and confirm its script is
  absent on every page after a single save, with no code change or redeploy.
- **SC-003**: A code audit of the application confirms exactly one
  framework-level analytics injection point and zero per-page analytics script
  injections.
- **SC-004**: An anonymously readable public page, with an enabled provider, is
  served from the static/ISR cache and includes the analytics script in the
  cached body without any per-request session lookup; changing provider state
  revalidates the affected public pages.
- **SC-005**: A non-admin user, anonymous visitor, or API key attempting to
  access the analytics configuration is denied without any Tracking ID being
  exposed.
- **SC-006**: Adding a new analytics provider via the registration contract, or
  adding a new page/route to the product, requires zero edits to existing page
  components for the analytics script to appear on the new page or for the new
  provider's script to appear on all pages.

## Assumptions

- **Administrator-owned configuration**: Analytics provider configuration is
  site-wide and administrator-owned. There is no per-user analytics preference
  in this feature; every visitor receives the same set of enabled provider
  scripts on a given page.
- **Tracking ID is the only required credential**: Per the request, each
  provider requires a single Tracking ID-like identifier (Baidu Tongji's code
  or Google Analytics Measurement / Tracking ID). Additional credential types
  (API tokens, service-account JSON) are out of scope for v1; providers that
  need more than a Tracking ID can be added later behind the same registration
  contract.
- **Script shape is provider-defined**: Each provider ships a known script
  snippet shape (a `<script>` tag, possibly with an inline config object) that
  the framework-level injection point renders with the saved Tracking ID. The
  system does not author new tracking scripts; it renders the provider's
  canonical snippet.
- **Built-in providers**: Baidu Tongji and Google Analytics are the two
  built-in providers at launch; both are registered through the same contract as
  any future provider (no special-case page code).
- **Permission reuse**: Configuration access reuses the existing administrative
  permission model. Restricting analytics configuration to administrators is
  handled through the existing permission chokepoint rather than a new
  permission concept.
- **Cache integration**: Public page cache invalidation reuses the existing
  public-content cache tag and revalidation mechanism; no new cache
  infrastructure is introduced.
- **Consent / GDPR / cookie-banner**: This feature injects the provider scripts
  and renders them with the configured Tracking ID. Any visitor-consent layer,
  cookie banner, or regional privacy gating is out of scope for v1 and would be
  layered on top of the framework-level injection point in a future feature.
