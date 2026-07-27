# Feature Specification: Skill System & Provider-Agnostic Tool Calling

**Feature Branch**: `028-skill-system`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "支持Anthropic的Skill体系，包括Skill的管理，都在后台的AI配置分类配置项内进行配置和管理（加一下Skills的配置）。这个服务也需要能从skill的标准安装目录中加载skill（这些一般是通过Volume Mount上来的，不需要支持在线的修改）。通过docker启动时，需要支持把host中存在的skill挂载到Docker内以便使用。内置Wiki Writer（包括扩充）, Wiki Tagger, Wiki Linker这几个Skill（功能如名字所隐含的，Linker是指把页面中已经在Wiki有介绍的关键词转成HyperLink）。后台管理页面需要能浏览和在线修改Skill内的文件（包括脚本）。这一版Skill中的脚本只作为参考，不直接使用tool来执行，重点是要完善Tool Call相关的抽象，保障provider的Agnostic。"

**Depends on**: 004-system-ai-support (AI settings, model configuration, permissions), 014-page-tags-metadata (tags and metadata for the Tagger skill), 018-revision-diff (review of proposed page changes), 020-model-capability-detector (per-model tool-calling capability), 022-llm-wiki-mode (Raw evidence and provenance), 026-wiki-ai-tool-runtime (tool registry, policy, review proposals, tool-call chat visualisation).

## Summary

This feature has two halves that reinforce each other.

**Provider-agnostic tool calling** is the engineering focus. Today the tool runtime reaches the model through a single text-based convention, which ties the assistant's operational ability to how one kind of model happens to behave. This feature introduces one provider-neutral representation of tool definitions, tool-call requests, and tool results, with adapters that use a provider's native function-calling when the selected model supports it and fall back to the text protocol when it does not. Which provider or model is configured must never change which tools exist, which permissions apply, or how changes are reviewed.

**Skills** are the user-facing payoff. A new **Skills** section in AI settings manages reusable, file-based instruction packages that teach the assistant how to perform a recurring wiki task. Skills come from three sources: packages shipped with the product, packages discovered in a configured skills directory (typically volume-mounted from the host in container deployments), and packages created by Administrators. The product ships three built-in skills: **Wiki Writer** (drafting new pages and expanding existing ones), **Wiki Tagger** (proposing tags and metadata), and **Wiki Linker** (turning keywords that already have wiki pages into hyperlinks). Administrators can browse every file inside a skill, including its reference scripts, and edit files for skills whose source permits it; directory-loaded skills are read-only.

Skill scripts in this release are **reference material only**. They are shown, stored, and given to the model as text; the system never executes them. Skills reach the model through progressive disclosure — a compact catalogue of names and descriptions, with full content loaded on demand through the same governed tool runtime that every other tool call uses — so a large skill library does not tax every conversation.

Skills carry no authority of their own. A skill tells the assistant *how* to approach a task; what it may actually do is still decided by the initiating user's permissions and the existing review policy, and durable changes still land as drafts or reviewable proposals.

## Clarifications

### Session 2026-07-26

- Q: Skill name conflicts — resolve by precedence, or forbid outright? → A: Forbid duplicate names outright; reject the newcomer and report the conflict, so no user or model can act on the wrong skill.
- Q: How should external MCP servers be connected (remote HTTP, local subprocess, both, or defer)? → A: Drop MCP support from this feature entirely. This release delivers the Skill system plus the provider-agnostic tool-call abstraction; the existing Tools section in AI settings keeps its current name and scope.
- Q: How is a skill triggered — model-driven, an explicit chat affordance, or admin binding to AI actions? → A: Purely model-driven. The model matches the request against each enabled skill's description and loads what it needs; a user who wants a specific skill names it in plain language. No skill picker in chat and no admin binding of skills to AI actions.
- Q: Where do edits to editable skills live — the application's own datastore, a writable data directory, or a mix? → A: The application's own datastore only. Built-in skills are stored as overrides that can be reset to the shipped default; admin-authored skills are stored in full. The configured skills directory is never written to, so it can be mounted read-only.
- Q: Do Wiki Tagger and Wiki Linker run conversationally, as background batch runs, or both? → A: Conversationally only. Skills act on the pages a user identifies in the conversation, within the existing per-turn tool-call limit. Background or whole-space batch runs are out of scope; batch curation stays with the existing curation surface.
- Q: Who may load a skill — any AI user, per-skill role gating, or derived from the skill's operations? → A: Any user with AI access may load any enabled skill. Enablement is the only control, set globally by Administrators. No per-skill authorisation is added, because a skill confers no authority of its own; what actually happens is still bounded by the user's own permissions and the review policy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provider-Agnostic Tool Calling (Priority: P1)

As an Administrator who may switch AI vendors, I want tool calling to work identically across providers and models, so that changing the configured model never silently breaks or changes what the assistant can do.

**Why this priority**: Everything else in this feature — skill loading, skill invocation, the built-in skills' governed changes — rides on the tool-call contract. Without a provider-neutral abstraction, each new provider or tool source multiplies the failure surface.

**Independent Test**: Configure two chat models from different providers, one that supports native tool calling and one that does not. Run the same wiki task on each. Confirm both complete the task with the same tools, the same permission decisions, the same review outcomes, and the same chat presentation.

**Acceptance Scenarios**:

1. **Given** a model whose tool-calling capability is known to be supported, **When** the assistant needs a tool, **Then** the request is issued through the provider's native tool-calling mechanism and the result is returned through the same neutral envelope used everywhere else.
2. **Given** a model that does not support native tool calling, **When** the assistant needs the same tool for the same task, **Then** the runtime falls back to the text-based tool protocol and the user-visible behaviour — tool name, command record, status, result summary, review outcome — is unchanged.
3. **Given** an Administrator switches the configured chat model to a different provider, **When** a user repeats a previously successful tool-using request, **Then** the same tools remain available, the same permission scope is enforced, and the same review policy applies.
4. **Given** a model returns a malformed, unknown, or unauthorised tool call, **When** the runtime processes it, **Then** the call is rejected with a safe, provider-independent failure that is recorded and surfaced in chat without leaking provider internals or hidden content.
5. **Given** a tool result is too large for the model's context, **When** the result is returned, **Then** the runtime applies the same truncation and summarisation rules regardless of provider, and records that truncation occurred.
6. **Given** any supported provider adapter, **When** the shared adapter conformance checks run, **Then** every adapter demonstrates the same tool-definition, tool-call, tool-result, streaming, cancellation, and error semantics.

---

### User Story 2 - Manage the Skill Catalogue (Priority: P1)

As an Administrator, I want a Skills section in AI settings where I can see and control every skill the assistant knows, so that I decide which procedures the assistant may follow.

**Why this priority**: The catalogue is the control surface every other skill behaviour depends on, and it is what makes skills a governed feature rather than hidden prompt text.

**Independent Test**: Open AI settings, find the Skills section, see every known skill with its source and state, disable one, and confirm the assistant no longer offers or follows it while a non-admin cannot reach the section at all.

**Acceptance Scenarios**:

1. **Given** an Administrator opens AI settings, **When** they choose Skills, **Then** they see every known skill with its name, description, source, enabled state, and validation state.
2. **Given** several skills are enabled, **When** a conversation turn starts, **Then** the model receives only each enabled skill's name and short description, not its full contents.
3. **Given** the model determines a skill applies, **When** it requests that skill, **Then** the skill's main instructions are loaded into the conversation and the loading step is visible in the chat as a tool call.
4. **Given** a user names a skill in plain language, such as asking the assistant to use Wiki Linker on a page, **When** that skill is enabled and the user is permitted, **Then** the assistant loads and follows it without needing any separate skill picker or command syntax.
5. **Given** an Administrator disables a skill, **When** a user makes a request that skill would have covered, **Then** the skill is not listed to the model, its instructions are not loaded, and the assistant proceeds without it.
6. **Given** a skill is not enabled, or the requesting user has no AI access, **When** the model requests it — or the user names it explicitly — **Then** the request is denied with a safe message and no skill content is disclosed.
7. **Given** two users with different wiki permissions each ask the assistant to use the same enabled skill, **When** each turn runs, **Then** both load the same skill, and any difference in what actually happens comes only from their own permissions and the review policy.
8. **Given** a non-admin requests the Skills section or any skill's file content directly, **When** access is evaluated, **Then** the request is denied.
9. **Given** a skill's instructions attempt to grant permissions, alter review policy, or reach a resource the user cannot access, **When** the assistant acts on them, **Then** the attempt has no effect and the user's own permissions and the configured review policy still govern the outcome.

---

### User Story 3 - Built-In Wiki Skills (Priority: P1)

As a wiki maintainer, I want the assistant to come with skills for writing, tagging, and linking, so that recurring knowledge-base work follows a consistent, reviewable procedure without me writing prompts each time.

**Why this priority**: The built-in skills are what makes the skill system immediately useful; they also serve as the reference examples for anyone authoring their own.

**Independent Test**: With the built-in skills enabled, ask the assistant to expand an existing thin page, to tag a set of untagged pages, and to hyperlink known concepts in a page. Confirm each request loads the matching skill, follows its procedure, and produces a reviewable change rather than a direct publish.

**Acceptance Scenarios**:

1. **Given** the Wiki Writer skill is enabled, **When** a user asks the assistant to draft a new page or expand an existing one, **Then** the assistant follows the skill's procedure and produces a draft or proposed revision through the existing review path.
2. **Given** the Wiki Tagger skill is enabled, **When** a user asks the assistant to tag or re-tag the pages they identify in the conversation, **Then** the assistant proposes tag and metadata changes with before/after detail through the existing change-proposal path.
3. **Given** the Wiki Linker skill is enabled, **When** a user asks the assistant to link a page, **Then** the assistant identifies keywords in the page that already have corresponding wiki pages, proposes converting exactly those keywords into links to those pages, and leaves keywords without an existing page untouched.
4. **Given** the Wiki Linker proposes links, **When** the proposal is reviewed, **Then** each proposed link shows the keyword, its location in the page, and the target page, and the reviewer can accept or reject the proposal as a whole change.
5. **Given** a request that no enabled skill covers, **When** the assistant answers, **Then** it proceeds without a skill and does not fabricate skill guidance.
6. **Given** a built-in skill is disabled, **When** a user makes a request that skill would have covered, **Then** the assistant answers without that skill's procedure and does not silently fall back to it.

---

### User Story 4 - Browse and Edit Skill Files (Priority: P2)

As an Administrator, I want to browse and edit the files inside a skill, so that I can adapt the built-in procedures to my wiki's conventions and author new skills without leaving the admin interface.

**Why this priority**: Editing is what makes skills adaptable rather than fixed features, but the skills are already useful before an editor exists.

**Independent Test**: Open a built-in skill in the Skills section, browse its file tree, open its main instruction file and a reference script, edit the instruction file, save, confirm the change affects the next assistant turn, then reset the skill to its shipped default.

**Acceptance Scenarios**:

1. **Given** an Administrator opens a skill, **When** the skill detail loads, **Then** they see the skill's name, description, source, enabled state, and a browsable tree of every file it contains, including scripts and reference documents.
2. **Given** an Administrator opens a file inside an editable skill, **When** they change and save it, **Then** the new content is persisted, versioned, attributed, and used by subsequent assistant turns.
3. **Given** a skill's main instruction file is missing required metadata such as its name or description, **When** the Administrator tries to save, **Then** the save is rejected with a specific validation message and the previous content stays in effect.
4. **Given** a skill was loaded from the configured skills directory, **When** an Administrator opens it, **Then** its files are viewable but clearly marked read-only and every edit, create, delete, and rename control is unavailable.
5. **Given** an Administrator has edited a built-in skill, **When** they choose to reset it, **Then** the skill returns to its shipped default content and the reset is recorded.
6. **Given** an Administrator creates or deletes a skill they own, **When** the change is saved, **Then** the skill catalogue updates accordingly and the action is audited.
7. **Given** a file inside a skill is binary or exceeds the viewer's size limit, **When** it is opened, **Then** the system shows its name, type, and size and explains that it cannot be displayed or edited inline, without failing the rest of the file browser.
8. **Given** a non-admin requests any skill file, **When** access is evaluated, **Then** the request is denied.

---

### User Story 5 - Load Skills from a Mounted Directory (Priority: P2)

As an operator running the product in a container, I want skills installed on the host to be usable inside the service, so that I can manage a shared skill library with my existing tooling instead of re-entering it through the admin UI.

**Why this priority**: Directory loading is how teams bring their own skills at scale, but the product is fully functional with built-in and admin-authored skills alone.

**Independent Test**: Place a valid skill package in a host directory, start the service with that directory mounted at the configured skills location, confirm the skill appears in the Skills section as read-only and enabled-capable, then remove it from the host and confirm it disappears after a rescan.

**Acceptance Scenarios**:

1. **Given** a skills directory is configured, **When** the service starts, **Then** every valid skill package directly under it is loaded, listed with source "directory", and marked read-only.
2. **Given** a directory entry is not a valid skill package — missing its instruction file, missing required metadata, or otherwise malformed — **When** loading runs, **Then** that entry is skipped, the reason is recorded and shown to Administrators, and all valid skills still load.
3. **Given** a directory skill has the same name as a skill that is already known, **When** loading runs, **Then** the directory skill is rejected as a duplicate name, is not loaded or listed as usable, and the conflict — both the rejected package's location and the name it collides with — is reported to Administrators.
4. **Given** no skills directory is configured or the configured path does not exist, **When** the service starts, **Then** it starts normally with only built-in and admin-authored skills and records an informational notice rather than an error.
5. **Given** an Administrator adds or changes skills on the host after startup, **When** they trigger a rescan from the Skills section, **Then** the catalogue reflects the current directory contents without restarting the service.
6. **Given** the documented container deployment configuration, **When** an operator follows it, **Then** they can mount a host skill directory into the service read-only and see those skills in the Skills section.
7. **Given** a directory skill contains a path that escapes the skill package or a symbolic link pointing outside it, **When** loading runs, **Then** the offending file is not exposed and the skill is either loaded without it or rejected with a recorded reason.

---

### User Story 6 - Observe and Troubleshoot Skills (Priority: P3)

As an Administrator, I want to see what the skill system is doing, so that I can diagnose why a skill did not load or did not apply.

**Why this priority**: Valuable for operations, but each individual capability is testable and useful before a dedicated observability surface exists.

**Independent Test**: Place one valid and one malformed skill package in the skills directory, use the valid one in a conversation, then open the Skills section and confirm it accurately reports the successful use and the specific rejection reason.

**Acceptance Scenarios**:

1. **Given** skills have been loaded during conversations, **When** the Administrator opens the Skills section, **Then** each skill shows whether it is enabled, its source, its validation state, and when it was last used.
2. **Given** a skill was rejected at load time, **When** the Administrator inspects it, **Then** they see the specific reason and the corrective action, without raw secrets or internal stack detail.
3. **Given** a durable change was produced while a skill was loaded, **When** an authorised user inspects that change later, **Then** they can tell which skill was in use.

---

### Edge Cases

- A model claims tool-calling support but rejects the native tool payload at runtime: the runtime records the failure and falls back to the text protocol for that model rather than failing the user's request.
- A model emits a tool call through the strategy the runtime is not currently using — a native tool call during a text-protocol turn, or a fenced text block during a native turn: the stray call is handled or rejected consistently rather than being half-executed.
- A skill's instructions conflict with the configured review policy, for example by telling the assistant to publish directly: the review policy wins and the skill's instruction has no effect.
- Two Administrators edit the same skill file concurrently: the second save is rejected or explicitly flagged as a conflict rather than silently overwriting.
- A skill's instruction file is edited into an invalid state through the API rather than the UI: validation runs on write and the skill is not activated in an invalid state.
- The mounted skills directory is empty, is not readable by the service, or is removed while the service runs: the service continues serving with the remaining skills and surfaces the condition to Administrators.
- Two skill packages in the mounted directory declare the same name: the one that would be registered second is rejected as a duplicate and both package locations are named in the conflict report, so the operator can tell which directories are involved.
- A skill is rejected for a duplicate name and the operator then renames the package on the host: the next rescan loads it normally and the conflict report clears, with no restart and no manual cleanup.
- A duplicate-named skill was previously enabled and a colliding skill later appears: the previously registered skill keeps working unchanged; the newcomer is rejected rather than taking over its name or its enabled state.
- The Wiki Linker finds a keyword that matches several pages, matches a page the user cannot read, or occurs inside code blocks, existing links, or headings: ambiguous and unauthorised targets are skipped, and structurally unsafe positions are never linked.
- A user asks a skill to cover more pages than one turn allows, such as tagging the whole wiki: the assistant covers what the per-turn limit permits, names the pages it did and did not reach, and does not start an unbounded background run.
- A user cancels a turn while a skill is loading: the turn stops, in-flight work is abandoned, and no durable change is applied.
- AI is not configured at all: the Skills section remains viewable and configurable, and no outbound model call is made.

## Requirements *(mandatory)*

### Functional Requirements

#### Provider-agnostic tool calling

- **FR-001**: The system MUST represent tool definitions, tool-call requests, and tool results in a single provider-neutral form that all provider adapters consume and produce.
- **FR-002**: The system MUST issue tool calls through a provider's native tool-calling mechanism when the selected model is known to support it, and MUST fall back to the text-based tool protocol otherwise.
- **FR-003**: The system MUST determine a model's tool-calling capability from recorded model capability data, and MUST allow an Administrator to override that determination per model.
- **FR-004**: The user-visible behaviour of a tool call — name, command record, running status, completion status, result summary, review outcome, failure message — MUST be identical regardless of which strategy or provider was used.
- **FR-005**: The system MUST reject malformed, unknown, disabled, or unauthorised tool calls with a safe failure that discloses no hidden content, no credentials, and no provider internals.
- **FR-006**: The system MUST apply one truncation and summarisation policy to tool results across all providers and tool sources, and MUST record when truncation occurred.
- **FR-007**: The system MUST NOT require any change to tool definitions, permission scopes, or review policy when a provider or model is added, removed, or switched.
- **FR-008**: Every provider adapter MUST satisfy a shared conformance contract covering tool definition translation, tool-call parsing, tool-result submission, streaming, cancellation, and error mapping.
- **FR-009**: The tool-call abstraction MUST NOT assume the built-in wiki provider is the only possible source of tools; adding a further tool source later MUST NOT require changing the neutral envelope, the permission model, the review policy, or the chat presentation.

#### Skill catalogue

- **FR-010**: The AI settings area MUST include a Skills section listing every known skill with its name, description, source, enabled state, and validation state.
- **FR-011**: The system MUST support three skill sources: skills shipped with the product, skills discovered under a configured skills directory, and skills authored by Administrators.
- **FR-012**: A valid skill package MUST consist of a directory containing a main instruction file that declares at least a name and a description, plus any number of additional reference files.
- **FR-013**: Administrators MUST be able to enable and disable each skill independently of its source.
- **FR-013a**: A skill's identity MUST be the name declared in its instruction file. A directory-sourced package whose directory name disagrees with its declared name MUST be loaded under the declared name, with the mismatch reported to Administrators.
- **FR-014**: Skill names MUST be unique across all sources. The system MUST reject any skill whose name is already taken rather than shadowing, merging, or replacing the existing skill, and MUST report the rejected skill, its origin, and the name it collides with to Administrators.
- **FR-015**: A duplicate-named skill MUST NOT be loaded, listed as usable, offered to the model, or enableable; it is reported only as a conflict to be resolved.
- **FR-016**: The system MUST reject the creation or renaming of an admin-authored skill when the target name is already taken by any known skill, with a message naming the conflicting skill's source.
- **FR-017**: Only Administrators MUST be able to view or modify skill configuration, and all skill configuration changes MUST be audited.

#### Skill delivery at runtime

- **FR-018**: Each conversation turn MUST present enabled skills to the model as name and short description only, never as full contents.
- **FR-019**: The system MUST provide governed operations for the model to load an enabled skill's main instructions and to read a named reference file within it, and these operations MUST appear in chat as tool calls like any other.
- **FR-019a**: Skill selection MUST be driven by the model matching the request against the presented skill descriptions. The system MUST NOT require a skill picker, command syntax, or Administrator binding of skills to AI actions, and a user naming a skill in plain language MUST be sufficient to have it loaded when it is enabled and permitted.
- **FR-020**: The system MUST NOT execute any script or command contained in a skill; script files are returned as text reference material only.
- **FR-021**: The system MUST enforce a limit on the total skill content loaded into a turn, truncating with an explicit marker and recording that truncation occurred.
- **FR-022**: The system MUST deny skill-load requests for skills that are not enabled and for users without AI access, with a safe message that discloses no skill content.
- **FR-022a**: Any user with AI access MUST be able to load any enabled skill. The system MUST NOT apply per-skill authorisation, role gating, or visibility scoping; enablement is the only control, and it is set globally by Administrators.
- **FR-023**: Skill content MUST be treated as instructions only for how to use the available tools; it MUST NOT be able to grant permissions, change review policy, register tools, or reach resources the initiating user cannot access.
- **FR-024**: The system MUST record which skills were loaded during a turn and MUST make that record available on any durable change the turn produced.

#### Directory-sourced skills

- **FR-025**: The system MUST load skill packages found directly under the configured skills directory at startup, MUST record and display a specific reason for each entry it rejects, and MUST continue loading the remaining entries.
- **FR-026**: Directory-sourced skills MUST be read-only: no create, edit, rename, or delete operation on their files may be offered or accepted.
- **FR-026a**: The system MUST NOT write to the configured skills directory under any operation, so that the directory can be mounted read-only and the host copy remains the single source of truth for directory-sourced skills.
- **FR-027**: Administrators MUST be able to trigger a rescan of the skills directory without restarting the service.
- **FR-028**: The system MUST start normally, with a recorded informational notice rather than a failure, when no skills directory is configured or the configured path is absent or unreadable.
- **FR-029**: The system MUST NOT expose or load any file resolved outside a skill package's own directory, including through symbolic links or relative paths.
- **FR-030**: The documented container deployment MUST allow an operator to mount a host skill directory into the service read-only and have those skills load.

#### Skill file browsing and editing

- **FR-031**: Administrators MUST be able to browse the complete file tree of any skill and view the text content of any text file within it, including scripts.
- **FR-032**: Administrators MUST be able to create, edit, rename, and delete files within skills whose source permits editing, and those changes MUST be persisted, versioned, attributed, and audited.
- **FR-032a**: All skill edits MUST be persisted in the application's own datastore — the same store that is backed up with wiki content — so that skill customisation is captured by an ordinary backup and requires no second stateful location.
- **FR-032b**: An edited built-in skill MUST be stored as an override of its shipped content so the shipped default remains recoverable; an admin-authored skill MUST be stored in full.
- **FR-033**: The system MUST validate a skill's main instruction file on save and MUST reject saves that would leave the skill without a valid name or description, keeping the previous content in effect.
- **FR-034**: Administrators MUST be able to reset an edited built-in skill to its shipped default, and the reset MUST be recorded.
- **FR-035**: Administrators MUST be able to create and delete their own skills, and those operations MUST be audited.
- **FR-036**: The system MUST detect concurrent edits to the same skill file and MUST reject or explicitly flag the conflicting save rather than overwriting silently.
- **FR-037**: The system MUST identify files that cannot be displayed or edited inline — binary files or files above the size limit — by name, type, and size, without breaking the rest of the file browser.
- **FR-038**: Only Administrators MUST be able to read or write skill files.

#### Built-in skills

- **FR-039**: The product MUST ship a Wiki Writer skill that guides drafting new pages and expanding existing pages, producing drafts or proposed revisions through the existing review path.
- **FR-040**: The product MUST ship a Wiki Tagger skill that guides proposing tags and metadata for pages through the existing change-proposal path.
- **FR-041**: The product MUST ship a Wiki Linker skill that guides identifying keywords in a page that already have corresponding wiki pages and proposing those keywords be converted into links to those pages.
- **FR-042**: The Wiki Linker MUST leave keywords without an existing target page unchanged, MUST skip ambiguous targets and pages the user cannot read, and MUST NOT create links inside existing links, code blocks, or other positions where a link would break the page.
- **FR-043**: A Wiki Linker change MUST let a reviewer see each proposed link's keyword, its location in the page, and its target page, and MUST be acceptable or rejectable as one reviewable change. The page diff satisfies this: a Markdown diff shows the link text, the hunk it sits in, and the href. No link-specific review surface is required.
- **FR-044**: Built-in skills MUST be enabled by default on a new installation and MUST remain individually disableable.
- **FR-044a**: Skills MUST act only on pages the user identifies in the conversation, within the existing per-turn tool-call limit. The system MUST NOT start a background or whole-space run from a skill.
- **FR-044b**: When a user asks for work broader than a turn can complete, the assistant MUST do what the limit allows, state plainly which pages it covered and which it did not, and MUST NOT present partial coverage as complete.

#### Observability

- **FR-045**: Administrators MUST be able to see, per skill, its enabled state, source, validation state, and last used time.
- **FR-046**: Load and validation rejections MUST be reported with a specific reason and corrective action, and MUST NOT include secrets or internal stack detail.

### Public Content Delivery

This feature does not add or change any anonymously readable surface. Skill configuration and skill content are Administrator-only, and no skill content is rendered into published pages.

Skills reach published content only indirectly, through the existing governed change path: page bodies produced by Wiki Writer, and link changes produced by Wiki Linker, become drafts or proposed revisions and only alter a published page when an authorised user publishes them. Publishing therefore invalidates the affected page's cached representation through the existing page-publish invalidation, and no new cache representation, path, or tag is introduced by this feature. Tag and metadata proposals from Wiki Tagger follow the existing tag-change invalidation for any public navigation surface they affect.

### Key Entities *(include if feature involves data)*

- **Tool Call Envelope**: The provider-neutral representation of one tool interaction — the definition offered to the model, the call the model requested, and the result returned — used identically by the native and text-protocol strategies.
- **Skill**: A named, described package of instructions for a recurring wiki task. Has a source (built-in, directory, or admin-authored), enabled state, validation state, editability, last-used time, and a set of files.
- **Skill File**: One file inside a skill — the main instruction file, a reference document, or a reference script. Has a path relative to its skill, a content type, a size, and, for editable skills, revision and authorship information.
- **Skill Load Record**: The record that a skill or one of its files was loaded into a conversation turn, linked to the tool call that loaded it, used for observability and for skill attribution on any resulting durable change.

## Out of Scope

- **MCP support of any kind.** Registering, connecting to, or managing external MCP servers is deliberately deferred. The existing Tools section in AI settings keeps its current name and scope, and no MCP configuration surface is added. FR-009 exists so that adding an external tool source later does not require reworking the tool-call abstraction, permission model, or review model.
- **Executing skill scripts.** Scripts inside skills are reference material this release. No sandbox, runtime, or execution path is delivered.
- **Nested skill discovery.** Only directories immediately beneath the configured skills root are treated as skill packages.
- **Skill marketplaces, remote installation, or automatic updates.** Skills arrive only by shipping with the product, being mounted from the host, or being authored in the admin interface.
- **Explicit skill-invocation UI.** No skill picker, slash-command syntax, or per-action skill binding is added. Selection is the model's, from the presented descriptions; naming a skill in plain language is the only user-side control.
- **Background or whole-space skill runs.** Skills operate on pages named in a conversation. Sweeping an entire space with Wiki Tagger or Wiki Linker, progress tracking for such a sweep, and bulk proposal review remain with the existing curation surface; connecting skills to it is a later feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The same tool-using wiki task completes successfully on both a model that supports native tool calling and one that does not, with identical tool availability, permission outcomes, and review outcomes.
- **SC-002**: Switching the configured chat model to a different vendor requires zero configuration changes to tools, skills, permissions, or review policy, and a previously working tool-using request still succeeds.
- **SC-003**: An operator following the documented container instructions can make host-installed skills visible in the service on first start, with no in-app configuration step.
- **SC-004**: An invalid skill package in the skills directory never prevents the service from starting or other skills from loading, and its rejection reason is visible to Administrators.
- **SC-005**: With 20 skills enabled, the per-turn instruction overhead for the unused skills stays bounded to their names and short descriptions, and only the applicable skill's full content is loaded.
- **SC-006**: An Administrator can open a built-in skill, edit its instructions, observe the change in the assistant's next answer, and restore the shipped default, all from the admin interface.
- **SC-007**: No script contained in any skill is executed by the service under any input — verified by tests covering built-in, directory, and admin-authored skills.
- **SC-008**: On a new installation, asking the assistant to expand a thin page, tag untagged pages, and link known concepts each produces a reviewable proposal without further configuration.
- **SC-009**: Wiki Linker proposals link only keywords with an existing, unambiguous, readable target page, and introduce no broken or nested links, across a representative page corpus.
- **SC-010**: No two usable skills ever share a name; every duplicate is visible to Administrators as a named conflict with its origin, and resolving it on the host takes effect on the next rescan without a restart.
- **SC-011**: No skill can cause a durable change that the initiating user could not have made directly, and every skill-driven durable change is attributable to both the user and the skill.
- **SC-012**: Each built-in skill is loaded for its intended task phrased several different natural ways, and is not loaded for ordinary questions it does not cover — verified without the user using any special syntax or picker.
- **SC-013**: Restoring an ordinary backup of the application data restores every skill customisation exactly, and the service runs correctly with the skills mount attached read-only.

## Assumptions

- **Skill format**: A skill is a directory containing a Markdown instruction file with frontmatter declaring `name` and `description`, plus optional reference files and scripts — the same layout used by Anthropic's published skill format — so that skills authored for other Claude-based tools load without conversion.
- **Skill identity**: The `name` declared in the instruction file's frontmatter is the canonical identity used for uniqueness, conflict reporting, and the catalogue presented to the model. A directory-sourced package whose directory name disagrees with its declared name is loaded under the declared name, and the mismatch is reported to Administrators so the host copy can be corrected.
- **Skill authorisation**: There is no per-skill access control. Any user with AI access may load any enabled skill, because a skill is instructions rather than authority — the initiating user's own permissions and the configured review policy still decide what the turn may actually do (FR-023, SC-011). Administrators control availability by enabling or disabling the skill for everyone.
- **Skills directory**: A single configurable skills root path is supported, defaulting to a conventional in-container location, with sub-directories directly beneath it treated as skill packages.
- **Editability by source**: Built-in skills are editable through stored overrides and can be reset to their shipped default; admin-authored skills are fully editable; directory-sourced skills are read-only, as stated in the feature request.
- **Edit storage**: All editable-skill content lives in the application's own datastore. There is no second writable location on disk, the skills mount stays read-only, and an ordinary backup of the application data captures every skill customisation. A skill's effective content is therefore resolved as: shipped content, plus any stored override, or the stored content in full for admin-authored skills.
- **Name uniqueness**: Duplicate skill names are forbidden outright rather than resolved by precedence, so that no user or model can ever act on a skill different from the one they meant. When a conflict arises, the skill already established keeps the name and the newcomer is rejected: built-in skills are registered first, then admin-authored skills, then directory skills in a stable scan order. Resolving a conflict is an operator action — rename the package on the host, or rename or delete the admin-authored skill.
- **Skill invocation**: Skills are surfaced to the model through progressive disclosure — a compact catalogue of names and descriptions, with full content loaded on demand through the tool runtime. Selection is the model's, based on description matching; a user who wants a particular skill simply names it. This makes each skill's `description` the load-bearing field for correct triggering, so the built-in skills' descriptions must be written for match quality, not for prose.
- **Scripts**: Script files inside skills are reference material in this release. A future release may add a sandboxed execution path; nothing in this release's data model or UI may assume scripts will never become executable.
- **Review policy**: This feature introduces no new review model. It reuses the draft/diff path for page-content changes and the change-proposal path for tag and metadata changes established in earlier features.
- **Links are derived, not stored**: A wiki's link graph — backlinks, related pages, orphan detection — is computed from the Markdown source when a page is read. Turning a keyword into a link is therefore an ordinary content edit with nothing to register, which is why Wiki Linker needs no storage of its own. A skill that required one would stop working outside this product, and portability is the point of adopting the standard skill format at all.
- **Capability data**: Per-model tool-calling capability comes from the existing model capability detection, with an Administrator override available for models it cannot classify.
- **Skill authoring UX**: The admin skill editor is a plain text file editor with validation, not a structured skill-authoring wizard.
- **Localisation**: Built-in skill instruction content ships in English; the admin interface around it follows the product's existing localisation.
