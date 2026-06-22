# Feature Specification: Appearance & Site Configuration

**Feature Branch**: `006-appearance-and-site-config`  
**Created**: 2026-06-22  
**Status**: Draft  
**Input**: User description: "1. 引入系统级别的主题色、默认字体、字号等配置，并在代码层面引入全局的主题色模块，使用名来引用颜色，页面的代码样式中不hardcode任何颜色、字体、字号等样式信息。 2. 引入一个Markdown主题的用户配置模块，用于控制markdown中各种元素的样式，以便不同用户可以以不同格式风格来阅读Markdown。当前样式为默认样式，同时探查 https://docs.requarks.io/editors/markdown 这个Wiki的样式作为另一个样式选项。用户可以直接在页面内查看每个样式（CSS文件内容）、复制、调整、更名、启动。3. 引入网站基础信息配置模块，来配置网站名、图标（你来生成一个默认的）、页脚信息 （比如版权及备案信息）为中国用户可能提供独立的备案号配置。 4. 优化分页导航，添加第一页和最后一页的入口，同时第几页的信息需要作为参数体现在URL上。（这应该是统一的分页组件，不需要各个页面自己做的）"

## Clarifications

### Session 2026-06-22

- Q: 系统主题明暗配色的配置方式? → A: 管理员分别为明/暗两种模式各配置一套完整的命名配色值。
- Q: 系统默认字体的来源? → A: 仅从随产品打包的内置字体集(含系统字体栈)中选择;不引入远程 Web 字体,以符合自托管、小体积、离线、不加载远程资源的约束。
- Q: Markdown 阅读主题与配色/明暗的关系? → A: Markdown 主题只覆盖排版类样式(字体、字号、间距、边框等),颜色一律继承系统配色 token,从而保证明暗模式下配色始终一致。
- Q: 用户激活的 Markdown 主题在哪些场景生效? → A: 阅读视图与编辑器预览;HTML 导出(若存在)天然复用同一渲染,无需单独处理。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - System-Level Appearance Configuration (Priority: P1)

A site administrator opens an appearance settings area and adjusts the system's
visual identity — the brand/accent colors, default text and heading fonts, and
base font sizes — through named, semantic settings (e.g. "primary color",
"surface color", "body font", "base font size"). After saving, the new values
take effect across every surface of the product (reader, editor, admin, auth,
chat) without a code change or redeploy. No page hardcodes a raw color, font, or
font-size value; every styled element resolves its appearance from these named
system settings.

**Why this priority**: This is the foundation. A consistent, configurable design
token layer is required before any other appearance feature can be coherent, and
it is the only item that touches the entire product at once. It also brings the
codebase into compliance with the binding "no hardcoded style values" principle.

**Independent Test**: An administrator changes the primary/accent color and the
body font, saves, and confirms the change is reflected uniformly on a reader
page, the editor, and an admin page — while a code audit confirms feature pages
contain no raw color/font/font-size literals.

**Acceptance Scenarios**:

1. **Given** an administrator on the appearance settings page, **When** they
   change the primary color to a new value and save, **Then** every surface that
   uses the primary color reflects the new value after a refresh, with no code
   change.
2. **Given** the existing light and dark display modes, **When** the system
   appearance values are changed, **Then** both modes continue to work and
   derive their colors from the configured named settings.
3. **Given** any feature page in the product, **When** its styling is inspected,
   **Then** colors, fonts, and font sizes are referenced by name and no raw
   literal style values appear in page-level component code.
4. **Given** an administrator enters an invalid value (e.g. a malformed color or
   an unavailable font), **When** they attempt to save, **Then** the system
   rejects the change with a clear explanation and the previous values remain
   active.

---

### User Story 2 - Site Identity & Footer Configuration (Priority: P2)

A site administrator configures the wiki's basic identity: the site name, the
site icon/favicon, and the footer content (such as copyright text and, for
operators in China, regulatory filing numbers — ICP 备案号 and optional public
security 公安备案号). The configured name and icon appear in the header, browser
tab, and anywhere the site is identified; the footer renders on every page. If
the administrator provides no custom icon, a sensible default icon ships with the
product and is used automatically.

**Why this priority**: A self-hosted wiki must present itself as a real,
branded site to be deployable in production. China-based operators have a legal
requirement to display filing numbers, so this directly unblocks compliant
deployment.

**Independent Test**: An administrator sets the site name, uploads an icon, and
enters copyright and ICP filing text; every page then shows the configured name,
icon, and footer, and the filing number links to the official registry.

**Acceptance Scenarios**:

1. **Given** an administrator on the site information settings page, **When**
   they set a site name and save, **Then** the new name appears in the page
   header and the browser tab title across the product.
2. **Given** no custom icon has been uploaded, **When** any page loads, **Then**
   the shipped default icon is used as the site icon/favicon.
3. **Given** an administrator uploads a custom icon, **When** they save, **Then**
   that icon replaces the default everywhere the site icon is shown.
4. **Given** an administrator enters an ICP filing number (and optionally a
   public-security filing number), **When** a page is viewed, **Then** the
   footer displays the filing text linking to the official registry; **And**
   when those fields are empty, no empty compliance text is shown.
5. **Given** an administrator enters footer copyright text, **When** any page is
   viewed, **Then** that text appears in the footer on every page.

---

### User Story 3 - Personal Markdown Reading Themes (Priority: P3)

A reader wants Markdown content to be rendered in a visual style of their
choosing. They open a Markdown themes area and see the available themes,
including a built-in "Default" theme and a second built-in theme inspired by the
Wiki.js Markdown style. For any theme they can view its full stylesheet, copy it,
create a personal copy, adjust the styles, rename it, and activate it. Once a
theme is activated, that user's Markdown reading view (and editor preview) is
rendered with that style. Each user's theme choice and personal themes are
independent and do not affect other users.

**Why this priority**: This is a per-user personalization enhancement that
improves the reading experience but is not required for the product to function.
It depends conceptually on the styling/token foundation from Story 1.

**Independent Test**: A user views the built-in themes, copies one, edits and
renames the copy, activates it, and confirms an article renders with the new
style — while a second user, unchanged, still sees the default style.

**Acceptance Scenarios**:

1. **Given** the Markdown themes area, **When** a user opens it, **Then** they
   see at least two built-in themes ("Default" and a Wiki.js-inspired theme) and
   can view the full stylesheet content of each.
2. **Given** a built-in theme, **When** the user chooses to copy it, **Then** a
   new personal, editable theme is created from its content.
3. **Given** a personal theme, **When** the user adjusts its styles, renames it,
   and saves, **Then** the changes are persisted under the new name.
4. **Given** a saved theme, **When** the user activates it, **Then** their
   Markdown reading view re-renders with that theme's style.
5. **Given** a user activates a theme, **When** another user views the same
   article, **Then** the other user's rendering is unaffected.
6. **Given** built-in themes, **When** a user attempts to edit one directly,
   **Then** the system prevents editing the built-in and offers to create an
   editable copy instead.

---

### User Story 4 - Unified Pagination Navigation (Priority: P3)

A user browsing any paginated list (search results, admin lists, history, etc.)
uses one consistent pagination control that offers first-page, previous, next,
and last-page entries in addition to nearby page numbers. The current page is
reflected as a parameter in the URL, so the user can refresh, bookmark, share,
and use browser back/forward to return to a specific page. Every paginated list
in the product uses this same shared control rather than a per-page custom
implementation.

**Why this priority**: A self-contained usability and consistency improvement
that touches many lists but is independent of the appearance and identity work.

**Independent Test**: On a list spanning several pages, a user jumps to the last
page, the URL updates with the page number, they refresh and land on the same
page, and the first/previous/next/last controls behave correctly at the
boundaries.

**Acceptance Scenarios**:

1. **Given** a list with more items than fit on one page, **When** it is
   displayed, **Then** a pagination control shows first, previous, next, and
   last entries together with nearby page numbers.
2. **Given** a user on page 1, **When** they navigate to a later page, **Then**
   the URL updates to include the current page number as a parameter.
3. **Given** a URL containing a page number, **When** it is opened directly or
   refreshed, **Then** the corresponding page of results is shown.
4. **Given** the user is on the first page, **When** the control is shown,
   **Then** the first/previous entries are disabled; **And** on the last page,
   the next/last entries are disabled.
5. **Given** any two paginated lists in the product, **When** their pagination
   controls are compared, **Then** they are the same shared component with
   identical behavior.

---

### Edge Cases

- **Invalid system style values**: A malformed color, an unsupported font, or a
  non-positive font size is rejected on save; prior values stay active.
- **Theme that breaks rendering**: A user's custom Markdown stylesheet that
  produces unreadable or broken layout can be previewed before activation and
  reverted by switching back to a built-in theme.
- **Untrusted style content**: User-authored Markdown stylesheets must not be
  able to affect the global application chrome, break out of the content area,
  exfiltrate data, or load arbitrary remote resources — style effects are
  confined to the rendered Markdown content area.
- **Duplicate / empty theme name**: Renaming a theme to a name that already
  exists for that user, or to an empty name, is rejected with a clear message.
- **Deleting the active theme**: Deleting the currently active Markdown theme
  falls back to the Default theme.
- **Out-of-range page parameter**: A page number of zero, negative, non-numeric,
  or beyond the last page is clamped to a valid page (first or last) rather than
  erroring.
- **Empty or single-page list**: The pagination control degrades gracefully
  (hidden or fully disabled) when there is nothing to page through.
- **Missing site icon**: When no custom icon is configured, the shipped default
  icon is always available so no page is left without an icon.
- **Footer with no compliance data**: When filing fields are empty, the footer
  shows only the configured copyright text and no placeholder compliance text.

## Requirements *(mandatory)*

### Functional Requirements

#### System Appearance (Story 1)

- **FR-001**: The system MUST expose an administrator-facing configuration for
  system-level appearance values, including brand/accent and surface colors,
  default body and heading fonts, and base font sizes, each referenced by a
  stable semantic name.
- **FR-001a**: The system MUST let the administrator configure a complete set of
  named color values separately for each of the light and dark display modes.
- **FR-001b**: Default fonts MUST be selectable only from a set bundled/shipped
  with the product (including system font stacks); the system MUST NOT depend on
  remote/web font resources for the configured fonts.
- **FR-002**: Saved system appearance values MUST take effect across all product
  surfaces (reader, editor, admin, auth, chat) without any code change or
  redeploy.
- **FR-003**: Feature pages MUST NOT hardcode raw color, font, or font-size
  values; all such styling MUST resolve from the named system appearance
  settings.
- **FR-004**: The system MUST continue to support both light and dark display
  modes, with each mode's values derived from the named appearance settings.
- **FR-005**: The system MUST validate appearance values on save and reject
  invalid entries (malformed color, unavailable font, non-positive size) while
  preserving the previously active values.

#### Site Identity (Story 2)

- **FR-006**: The system MUST allow an administrator to configure the site name,
  and MUST display it in the page header and the browser tab title across the
  product.
- **FR-007**: The system MUST ship a default site icon/favicon and use it when no
  custom icon is configured.
- **FR-008**: The system MUST allow an administrator to upload a custom site
  icon that replaces the default everywhere the site icon appears.
- **FR-009**: The system MUST allow an administrator to configure footer content,
  including free-form copyright text, and MUST render the footer on every page.
- **FR-010**: The system MUST provide dedicated fields for China regulatory
  filing numbers (ICP 备案号, and an optional public-security 公安备案号) and,
  when provided, render them in the footer linking to the corresponding official
  registry; when empty, no compliance text is shown.

#### Markdown Reading Themes (Story 3)

- **FR-011**: The system MUST provide at least two built-in Markdown themes: a
  "Default" theme reflecting the current styling, and a second theme inspired by
  the Wiki.js Markdown style.
- **FR-011a**: Markdown themes MUST control only typographic/layout styling of
  Markdown elements (font family, font size, spacing, borders, and similar);
  colors MUST inherit from the system color settings so that rendering stays
  consistent across light and dark modes. A theme MUST NOT override system
  colors.
- **FR-012**: Users MUST be able to view the full stylesheet content of any
  theme within the application.
- **FR-013**: Users MUST be able to create a personal, editable theme by copying
  an existing theme, and MUST be able to adjust its styles, rename it, and save
  it.
- **FR-014**: Built-in themes MUST be read-only; an attempt to edit a built-in
  theme MUST instead offer to create an editable copy.
- **FR-015**: Users MUST be able to activate a theme; the active theme MUST
  control the rendering of that user's Markdown reading view and editor preview.
  Any HTML-based export reuses the same rendering and therefore inherits the
  active theme without separate handling.
- **FR-016**: A user's theme selection and personal themes MUST be private to
  that user and MUST NOT affect any other user's rendering.
- **FR-017**: User-authored theme styles MUST be confined to the rendered
  Markdown content area and MUST NOT be able to alter global application chrome
  or load arbitrary remote resources.
- **FR-018**: Renaming a theme to a duplicate or empty name MUST be rejected, and
  deleting the active theme MUST fall back to the Default theme.

#### Pagination (Story 4)

- **FR-019**: The system MUST provide a single shared pagination component used
  by every paginated list in the product.
- **FR-020**: The pagination component MUST provide first-page, previous,
  next, and last-page entries in addition to nearby page numbers.
- **FR-021**: The current page MUST be represented as a parameter in the URL so
  that refresh, deep linking, bookmarking, sharing, and browser back/forward all
  return the user to the same page.
- **FR-022**: First/previous controls MUST be disabled on the first page and
  next/last controls MUST be disabled on the last page.
- **FR-023**: An invalid page parameter (zero, negative, non-numeric, or beyond
  the last page) MUST be clamped to a valid page rather than producing an error.
- **FR-024**: The pagination component MUST degrade gracefully (hidden or fully
  disabled) for empty or single-page lists.

### Key Entities *(include if feature involves data)*

- **System Appearance Settings**: The site-wide, administrator-owned set of named
  appearance values — a complete color value set per display mode (light and
  dark), plus default fonts (chosen from a bundled font set), font sizes, and
  related layout values. Single active configuration for the whole site.
- **Site Information**: The site's identity and footer configuration — name,
  icon/favicon, copyright text, and China regulatory filing numbers (ICP and
  optional public-security). Single active configuration for the whole site.
- **Markdown Theme**: A named stylesheet controlling the typographic/layout
  rendering of Markdown elements (font, size, spacing, borders — not colors).
  Has a type (built-in/read-only vs. personal/editable), an owner (the system for
  built-ins, a user for personal themes), a name, and its style content.
  Built-ins include "Default" and "Wiki.js-inspired".
- **User Theme Preference**: The association between a user and their currently
  active Markdown theme.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An audit of feature page components finds zero raw color, font, or
  font-size literals; 100% of such styling resolves from named appearance
  settings.
- **SC-002**: An administrator can change the brand/accent color and default body
  font and see the change reflected uniformly on a reader page, the editor, and
  an admin page after a single save, with no code change or redeploy.
- **SC-003**: An administrator can set the site name, icon, and footer (including
  ICP filing text) and have all of them appear correctly on every page; the
  configured icon appears in the browser tab.
- **SC-004**: A user can switch their Markdown reading theme and see content
  re-rendered with the new style within 3 seconds, while a second user's
  rendering of the same content remains unchanged.
- **SC-005**: 100% of paginated lists in the product use the shared pagination
  component, expose first/previous/next/last entries, and reflect the current
  page in a URL that survives refresh and sharing.
- **SC-006**: A China-based operator can publish ICP (and optional
  public-security) filing numbers that render in the footer and link to the
  official registry, satisfying the visible-filing requirement.

## Assumptions

- **System appearance scope**: System-level appearance configuration is
  administrator-owned and applies site-wide. End-user personalization in this
  feature is limited to the Markdown reading theme (Story 3); per-user switching
  of the overall system theme is out of scope.
- **Existing token foundation**: The product already uses a named design-token
  layer for colors, spacing, radius, and typography. This feature makes those
  system values administrator-configurable and completes removal of any
  remaining hardcoded style literals, rather than introducing the token concept
  from scratch.
- **Markdown theme ownership**: Built-in themes are system-provided and
  read-only; personal themes are private to the user who creates them. There is
  no site-wide shared library of admin-published custom Markdown themes in this
  feature.
- **Theme format**: Markdown themes are expressed as stylesheet (CSS) content
  that users can view, copy, and edit directly in the application, consistent
  with the request to "view, copy, adjust, rename, activate" each style.
- **Wiki.js-inspired theme**: The second built-in theme reproduces the general
  look of the Wiki.js Markdown rendering (heading treatment, links, blockquotes,
  code blocks, tables, lists) as a self-authored stylesheet; it is an
  approximation, not a verbatim copy of any third-party asset.
- **Default icon**: A default site icon/favicon is generated and shipped with the
  product as part of this feature.
- **Page parameter naming**: A conventional, human-readable page query parameter
  (e.g. `page`) is used uniformly across lists.
