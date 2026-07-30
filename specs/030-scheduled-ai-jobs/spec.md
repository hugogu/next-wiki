# Feature Specification: Scheduled AI Jobs

**Feature Branch**: `030-scheduled-ai-jobs`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "建立scheduled Job体系用于定时触发可由用户自定义的AI任务，如：分析建立页面间关系，为页面添加标签，合并标签，优化页面内容等。Job的运行时应该与wiki ai功能共享。每个任务有任务描述以作为提示词，后台可以查看编辑任务的定义，查看每次运行的记录、结果。注意重用现有组件，维持页面设计及布局的一致性。"

## Summary

Provide an Admin-managed Scheduled AI Jobs area where a wiki owner can define recurring, AI-assisted maintenance tasks. Each job has a name, a natural-language task description used as its instruction, a schedule, a target scope, and an explicit execution owner. Typical jobs can identify possible relationships between pages, propose page tags or tag merges, or prepare improvements to page content.

Every scheduled run uses the same governed Wiki AI tool capability already available in interactive chat: the same enabled tools, model assignment, permissions, evidence, audit trail, and review rules. A scheduled job is therefore an automated trigger, not a second AI implementation or a privileged automation path. Read-only work produces a reviewable run result. Any suggested durable change is created as the existing kind of draft or change proposal and must be reviewed before it can take effect; a scheduled run must never silently modify, merge, publish, or delete wiki content.

Administrators can create, edit, pause, duplicate, manually start, and retire job definitions, and can inspect a history of all runs. Each run permanently records the definition snapshot, execution status, safe outcome summary, supporting references, and links to any proposals, drafts, or evidence it created. The management experience extends the existing AI administration, action history, and proposal views using their established layout and components.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define a recurring AI maintenance task (Priority: P1)

As an Admin, I want to define and schedule a scoped AI task in the AI administration area, so that recurring knowledge-base maintenance happens without me repeatedly starting the same chat request.

**Why this priority**: A safe, understandable definition is the foundation for every scheduled run and gives the owner control over what automation may attempt.

**Independent Test**: Create an enabled job named “Find related pages”, give it an instruction, select an allowed page scope and daily schedule, preview its next execution time, save it, and confirm it appears in the Scheduled AI Jobs list with its status and next run.

**Acceptance Scenarios**:

1. **Given** an Admin opens the AI administration area, **When** they open Scheduled AI Jobs, **Then** they can create a job with a name, task description, recurrence, time zone, target scope, and execution owner.
2. **Given** an Admin enters a task description, **When** they review the definition before saving, **Then** the page clearly shows the instruction that will be given to AI and the enabled Wiki AI capabilities that the job may use.
3. **Given** a job has a valid future recurrence, **When** the Admin saves it as enabled, **Then** the list shows its enabled state and next planned run in the job's selected time zone.
4. **Given** a job definition is incomplete, invalid, or selects no readable target scope, **When** the Admin attempts to save it, **Then** the system identifies the affected fields and does not activate the job.
5. **Given** a non-Admin opens the Scheduled AI Jobs area or its management links directly, **When** access is checked, **Then** access is denied without disclosing job definitions, scopes, instructions, or run history.

---

### User Story 2 - Run recurring work through the shared Wiki AI capability (Priority: P1)

As an Admin, I want an enabled job to run at its stated time using the existing Wiki AI capabilities and the job's execution owner, so that scheduled work has the same permissions, safety controls, and quality boundaries as work requested in chat.

**Why this priority**: The central value is dependable recurrence without creating a parallel or more privileged AI path.

**Independent Test**: Configure a due job that can inspect pages and propose tags. Let it run, then verify its activity and results follow the same enabled-tool policy, model availability rules, page permissions, evidence requirements, and proposal flow as an equivalent Wiki AI request.

**Acceptance Scenarios**:

1. **Given** an enabled job becomes due, **When** it starts, **Then** it runs using the job's saved instruction, current target scope, and selected execution owner's current permissions.
2. **Given** the Wiki AI model or a required tool capability is unavailable, disabled, or disallowed, **When** a job becomes due, **Then** the run is recorded as blocked or failed with a safe explanation and no alternative privileged operation is attempted.
3. **Given** the execution owner no longer has the required permissions or is no longer eligible to use Wiki AI, **When** a job becomes due, **Then** the run does not access protected content or create changes and its record explains why it was blocked.
4. **Given** a job's task needs multiple inspection and preparation steps, **When** it runs, **Then** it may use the shared Wiki AI capabilities iteratively within the same applicable limits as an interactive request.
5. **Given** a job run would exceed its permitted time or work limits, **When** the limit is reached, **Then** it ends in a visible non-success or partial state, preserves completed audit information, and does not present incomplete work as complete.
6. **Given** a scheduled run creates a result based on Wiki content, **When** an authorized Admin examines it, **Then** the result identifies the permitted pages, revisions, or other evidence that support its conclusions.

---

### User Story 3 - Review scheduled AI change proposals (Priority: P1)

As an Admin reviewer, I want every durable change suggested by a scheduled job to be presented as a draft or proposal, so that automation can prepare useful maintenance work without silently rewriting the wiki.

**Why this priority**: Review is the trust boundary that makes autonomous scheduling compatible with durable, evidence-based knowledge.

**Independent Test**: Run one job that suggests page links, page tags, tag consolidation, and content improvements. Confirm that each result links to a reviewable draft or proposal, no affected page/tag changes before approval, and only an explicit reviewer decision can apply the changes.

**Acceptance Scenarios**:

1. **Given** a scheduled run proposes a page-content change, **When** it finishes preparation, **Then** it creates a reviewable draft with the normal comparison to the current page state.
2. **Given** a scheduled run proposes non-page changes such as page tags, page relationships, or a tag merge, **When** it finishes preparation, **Then** it creates a reviewable proposal that shows every affected item, its before state, proposed after state, and the AI's stated reason.
3. **Given** a scheduled run proposes any durable change, **When** the run completes, **Then** the change remains unapplied until an authorized reviewer explicitly approves it through the established review flow.
4. **Given** a reviewer approves, rejects, or finds a proposal stale, **When** the review decision is made, **Then** the outcome is linked to the originating job run and preserves the existing conflict, permission, versioning, audit, and publication safeguards.
5. **Given** a scheduled job instruction requests automatic application, publication, deletion, or a bypass of review, **When** the job runs, **Then** the request cannot override the required review boundary.

---

### User Story 4 - Inspect, maintain, and control job definitions (Priority: P2)

As an Admin, I want to find a scheduled job, understand what it does, change or pause it, and manually test it, so that recurring automation remains intentional and easy to correct.

**Why this priority**: Maintenance controls make scheduled automation operable after its initial creation, but depend on the definition and execution paths.

**Independent Test**: Filter the jobs list, open one definition, change its instruction and schedule, pause it, start a manual test run, then retire it. Confirm the definition's future schedule changes while prior run records remain intact.

**Acceptance Scenarios**:

1. **Given** scheduled jobs exist, **When** an Admin opens the list, **Then** they can find jobs by name and status and see each job's scope summary, schedule, last outcome, next planned run, and enabled or paused state.
2. **Given** an Admin opens a job, **When** they edit its instruction, scope, schedule, execution owner, or enabled state, **Then** future runs use the saved changes while already-started runs retain the definition snapshot with which they began.
3. **Given** an enabled job is paused or retired, **When** its next scheduled time arrives, **Then** it does not start a new run and its earlier run history remains available.
4. **Given** an Admin needs to validate a job, **When** they select Run now, **Then** the system creates a separately marked manual run using the same permissions, AI capabilities, review boundary, and recording behavior as a scheduled run.
5. **Given** one run of a job is still active, **When** another scheduled occurrence or Run now request happens, **Then** the system does not run the same job concurrently and records or reports the skipped or deferred occurrence clearly.

---

### User Story 5 - Investigate each execution and its outcome (Priority: P2)

As an Admin, I want to inspect a scheduled run's status, result, and linked changes, so that I can verify the AI's work, act on useful proposals, and diagnose failures.

**Why this priority**: Run history is necessary for accountability and makes recurring work observable rather than opaque.

**Independent Test**: Complete successful, blocked, failed, cancelled, and proposal-producing runs. Open their history entries and confirm each has a timestamp, status, safe result, definition snapshot, actor context, and only the appropriate links and evidence for that Admin's access.

**Acceptance Scenarios**:

1. **Given** a job has run, **When** an Admin opens its history, **Then** they can see every run with start and finish time, trigger type, status, outcome summary, and a link to its detail.
2. **Given** an Admin opens a run detail, **When** the run used AI capabilities, **Then** they can see the saved definition snapshot, safe execution progress, supported conclusions, usage/outcome information, and links to relevant drafts, proposals, or evidence.
3. **Given** a run fails, is cancelled, or is blocked, **When** its detail is viewed, **Then** it shows a clear, safe explanation and preserves the work status without exposing secrets or content the viewer cannot read.
4. **Given** the current job definition has since changed or been retired, **When** an Admin views an older run, **Then** the historical definition and result remain distinguishable from the current definition.
5. **Given** an Admin is permitted to view a run but not every item involved in it, **When** its detail is displayed, **Then** inaccessible content, references, and proposal details are redacted rather than disclosed.

### Edge Cases

- A schedule crosses a daylight-saving change or an ambiguous local time: the job follows its selected time zone consistently, shows the next planned time clearly, and does not silently execute the same occurrence twice.
- The service is unavailable across one or more expected occurrences: recovery does not silently launch a burst of stale runs; skipped or resumed work is represented clearly in run history.
- A definition is changed while a run is queued or active: the in-progress run retains its original definition snapshot, while later runs use the newly saved definition.
- A job is paused, retired, or its execution owner loses access after it has begun: remaining steps stop where possible; no pending proposal is approved automatically; completed records remain auditable.
- The selected scope later contains moved, deleted, unpublished, or newly restricted pages: each access is re-evaluated during the run and unavailable content is not disclosed.
- A proposed tag merge, page relationship, or content revision conflicts with a later manual change: the reviewer receives the existing stale/conflict handling and cannot apply it blindly.
- A task description is malicious, malformed, excessively broad, or asks the assistant to ignore safeguards: it remains constrained by the approved scope, current permissions, enabled Wiki AI capabilities, work limits, and mandatory review boundary.
- A scheduled job has no valid next occurrence, no enabled applicable capability, or no eligible execution owner: it remains inactive or blocked with an actionable status instead of silently disappearing.

## Requirements *(mandatory)*

### Functional Requirements

**Job definitions and access**

- **FR-001**: The system MUST provide an Admin-only Scheduled AI Jobs management area within the existing AI administration experience.
- **FR-002**: Admins MUST be able to create a job definition with a unique display name, natural-language task description, recurrence, time zone, target scope, execution owner, and enabled or paused state.
- **FR-003**: The system MUST validate a job definition before it is enabled, including a usable schedule, an eligible execution owner, and at least one target the owner can read.
- **FR-004**: A job definition MUST show a human-readable schedule and its next planned run time in its selected time zone.
- **FR-005**: Admins MUST be able to edit, pause, resume, duplicate, manually run, and retire job definitions; retirement MUST preserve historical runs and audit information.
- **FR-006**: The system MUST prevent a non-Admin from viewing, creating, changing, triggering, or retiring scheduled AI job definitions and run history.

**Shared AI execution and safety**

- **FR-007**: Each job run MUST use the existing Wiki AI capability and its currently enabled tools, model eligibility checks, work limits, evidence behavior, and audit behavior; it MUST NOT use a separate privileged AI execution path.
- **FR-008**: Each run MUST use the job's saved task description as its AI instruction and retain an immutable snapshot of the effective definition used for that run.
- **FR-009**: Each run MUST act only within the execution owner's current permission scope and the job's configured target scope; scheduling MUST NOT elevate read, write, or review permissions.
- **FR-010**: The system MUST re-evaluate relevant permissions, AI eligibility, tool availability, and target accessibility when a run begins and before a proposed durable change can be applied.
- **FR-011**: Each job run MUST have explicit queued, running, completed, failed, blocked, cancelled, or skipped/deferred outcome visibility, including safe reasons for non-success states.
- **FR-012**: The system MUST bound scheduled work and prevent concurrent runs of the same job definition; it MUST visibly record or report an occurrence that cannot start because another run is active.
- **FR-013**: Scheduled execution MUST be recoverable after interruption without silently running an unbounded backlog of obsolete occurrences.
- **FR-014**: A manual Run now action MUST create a separately identifiable run and follow the same execution, permission, review, audit, and history rules as a normally scheduled run.

**Review, provenance, and durable changes**

- **FR-015**: A scheduled job MUST never directly apply, publish, merge, delete, or otherwise make a durable wiki change without explicit authorized review, regardless of language in its task description.
- **FR-016**: Scheduled page-content suggestions MUST use the established reviewable draft and revision comparison flow.
- **FR-017**: Scheduled non-page suggestions, including page relationships, tags, and tag merges, MUST use the established reviewable proposal flow with affected resources, before state, proposed after state, and stated rationale.
- **FR-018**: Every scheduled proposal or draft MUST retain a traceable link to its job definition, originating run, execution owner, AI command/activity record, and permitted supporting evidence.
- **FR-019**: Applying or rejecting a scheduled proposal or draft MUST preserve the existing permission re-check, conflict detection, audit, version-history, and publication safeguards.
- **FR-020**: If a conclusion or durable suggestion depends on newly obtained source material, the run MUST preserve or reference supporting evidence according to the existing Wiki AI evidence rules; it MUST not create ungrounded durable knowledge.

**History and interface consistency**

- **FR-021**: The system MUST retain a per-job run history showing each run's trigger type, definition snapshot, execution owner, start/finish time, status, safe outcome summary, and links to permitted related resources.
- **FR-022**: An Admin MUST be able to inspect a run detail that presents progress and outcome using the existing AI action/history and proposal patterns, including errors and usage information where available.
- **FR-023**: Run results and history MUST redact content, evidence, command details, and links that the viewing user is no longer permitted to access.
- **FR-024**: Job and run changes, triggers, outcomes, review decisions, and resulting durable changes MUST be audit traceable to the responsible actors and affected resources.
- **FR-025**: The Scheduled AI Jobs management area MUST reuse existing administration navigation, common controls, tables, filters, status presentation, detail views, localization, and visual design patterns; it MUST not introduce a competing AI management surface.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- Scheduled job definitions, run history, results, drafts, proposals, evidence, and controls are authenticated administration resources and MUST NOT appear in anonymously readable content or public navigation.
- A scheduled job does not itself alter an anonymously readable page. Only an authorized review and the normal page apply/publish workflow can change public content.
- If an approved scheduled suggestion changes a published page, its public body, metadata, and navigation MUST use the same existing static/refresh behavior and invalidation as the equivalent manual page change; personalized job controls and run information remain outside the public document.

### Key Entities *(include if feature involves data)*

- **Scheduled AI Job Definition**: The Admin-managed recurring instruction: its name, task description, schedule, time zone, target scope, execution owner, state, and next planned run.
- **Execution Owner**: The authorized user identity whose current Wiki AI entitlement and resource permissions bound a job run; it never grants additional access merely because a run is scheduled.
- **Scheduled AI Job Run**: One scheduled or manually triggered execution of a definition, retaining a definition snapshot, trigger type, timing, status, safe result, activity record, and related-resource links.
- **Target Scope**: The explicitly selected spaces, page areas, tags, or other allowed Wiki targets that constrain what a job may inspect and propose changes to.
- **Scheduled Change Proposal**: An existing reviewable draft or non-page proposal produced by a job run; it keeps the normal before/after details, reviewer decision, provenance, and audit history.
- **Run Evidence**: Permitted pages, revisions, or preserved source material that supports a run's conclusion or durable suggestion and can be inspected according to existing evidence permissions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, an Admin can create, validate, enable, and locate a scoped recurring job with its next run shown in under 3 minutes.
- **SC-002**: In scheduled-run acceptance tests, 100% of runs use only content and operations available to their execution owner's current permissions and configured target scope.
- **SC-003**: In acceptance testing, 100% of job runs that propose page edits, relationships, tags, or tag merges leave the affected durable state unchanged until an authorized reviewer explicitly approves the associated draft or proposal.
- **SC-004**: In a test set of successful, failed, blocked, cancelled, skipped, and manual runs, 100% of runs are discoverable in job history with their definition snapshot, trigger type, terminal/active status, and safe outcome explanation.
- **SC-005**: In administrator usability testing, an Admin can find a job's latest outcome and navigate to each linked permitted draft or proposal in under 60 seconds.
- **SC-006**: In access-control tests, 100% of attempts by non-Admins to access scheduled-job definitions or run history are denied, and 100% of redacted run-detail references remain undisclosed to viewers without access.
- **SC-007**: In recovery testing after an interruption spanning multiple due times, no job starts more than one stale concurrent run, and every skipped or resumed occurrence is represented clearly enough for an Admin to account for it.
- **SC-008**: In visual regression and usability review, Scheduled AI Jobs uses the established AI administration navigation, table, status, detail, and proposal patterns without adding a duplicate management entry point.

## Assumptions

- The first release lets Admins define recurring maintenance tasks for the instance. It does not introduce personal per-user schedules or a separate workflow-builder product.
- A job executes as one explicit eligible user selected by the Admin. That identity's permissions and AI access are checked afresh for each run; changing the definition or owner affects only later runs.
- Natural-language task descriptions are flexible instructions, but they can invoke only the existing, explicitly enabled Wiki AI capabilities within the selected scope and configured limits.
- The initial supported schedule experience covers ordinary recurring calendar times with a stored time zone. Advanced exceptions, holiday calendars, and arbitrary event triggers are deferred.
- Scheduled jobs always require explicit review for durable changes, even if an equivalent interactive tool operation could be allowed to apply immediately under a separate policy.
- Page relationships are represented through the existing or subsequently approved Wiki AI proposal vocabulary; this feature does not itself define a new public page-link data model.
- Existing AI action records, tool activity records, evidence, drafts, non-page proposals, audit entries, and administration UI patterns are the sources to reuse rather than duplicate.

## Out of Scope

- Executing arbitrary uploaded code, scripts, external webhooks, external tools, or unregistered AI capabilities on a schedule.
- Automatic approval, publication, deletion, tag merging, or direct durable mutation by a scheduled job.
- Personal schedules, task assignment to other users, notifications, billing controls, workflow chaining, event-triggered automation, holiday calendars, or a general-purpose workflow designer.
- Replacing the existing interactive Wiki AI chat, AI action history, tool policy, review/draft, proposal, evidence, permission, audit, or public-content delivery behavior.
