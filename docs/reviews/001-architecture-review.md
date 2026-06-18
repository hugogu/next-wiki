# 架构 / 模型 / 编码合理性 Review — 001-core-wiki-platform

**评审日期**: 2026-06-18
**评审基准**: 宪法 `.specify/memory/constitution.md` v1.3.0、`docs/architecture/mandates.md`、`specs/001-core-wiki-platform/{plan,data-model}.md`
**评审范围**: `apps/web/src/server`（schema / services / permissions / pipeline / auth）、API route handlers、前端数据流

---

## 总体结论

数据模型与服务层设计扎实，权限 chokepoint、不可变版本、事务边界等核心架构意图都正确落地了，前向兼容意识很好。**但治理文档与实际实现之间存在系统性漂移**：多项被宪法标记为「v1.x 固定、修改需修宪」的 Technology Decision，在没有修宪、且 plan 的 Constitution Check 仍标 PASS 的情况下被换掉了。这不是代码质量问题，而是「文档已不再描述系统」的治理问题——对一个把宪法设为 binding 的项目，这是最高优先级的隐患。

建议路线：对每一处漂移，二选一——**改实现对齐文档**，或**修宪 + 更新 plan 对齐实现**。关键是消除「文档说 A、代码做 B、自评说 PASS」的三角矛盾。

---

## 一、文档 vs 实现的漂移（最高优先级）

| 关注点 | 宪法 / plan 规定 | 实际实现 | 严重度 |
|---|---|---|---|
| 客户端编辑器 | 宪法技术决策写 **Toast UI Editor**；plan 同；但 `mandates.md`（Editor Extensibility）写 **Tiptap** | 实际是 **CodeMirror 6**（`@codemirror/*`），既非 Toast UI 也非 Tiptap | 高 |
| 认证 | 技术决策固定 **Better Auth**；`data-model.md` 明写「Better Auth-managed sessions」「Better Auth hashed」 | 完全自研：`bcryptjs` + 手写 cookie session（`next-wiki-session`），依赖里**没有** better-auth | 高 |
| API 架构 | `mandates.md` 写三层 tRPC / REST+OpenAPI / MCP；plan 写「REST + OpenAPI with shared Zod schemas」并列出 `openapi.ts` | 裸 Next.js route handlers，**无 tRPC、无 OpenAPI 文档、无 `/api/v1` 版本前缀**（mandate 要求 URL 版本化） | 高 |
| UI 组件库 | 技术决策 **Mantine + Tailwind + CSS 变量** | 依赖里**没有** Mantine；纯 Tailwind + CSS 变量 + 自研组件 / icons | 中 |
| pg-boss | plan 称「pg-boss is wired and ready」 | 依赖里**没有** pg-boss（本切片确实不需要，但「已接好」表述不实） | 低 |

**值得注意的内部矛盾**：宪法自身就不一致——技术决策表写 Toast UI Editor，而 mandates.md 写 Tiptap。这说明文档体系本身缺少一次对齐。

**自评失真**：plan 的 Constitution Check 把 `Editor Extensibility`、`P8 Open Standards`、`Frontend Data Flow` 都标 PASS，但其 PASS 描述（Toast UI、REST+OpenAPI、Zustand UI 态）与代码不符。Constitution Check 是治理闸门，失真会让后续切片继承错误前提。

> 注：CodeMirror / 自研 auth / 无 Mantine 这些选择本身可能是**更优**的工程决策，问题不在选择，而在「固定决策被改却没走修宪程序」。

---

## 二、数据模型（良好，少量风险）

设计与 mandate 高度吻合，亮点突出：

- canonical key `(space_id, path, locale)` 唯一索引、`page_revisions` 不可变 + `version_number` 每页唯一、source 级 diff-ready、`content_hash` 缓存身份——版本化 mandate 完整落地。
- 前向兼容字段（隐藏的 `space_id`/`locale`/`deleted_at`、`content_hash`）让多空间 / i18n / 软删除 / 渲染缓存 / Git-sync 都能「加功能而非加迁移」，意识很好。

**风险 1 — 缺数据库级外键（中）**：`pages.currentPublishedVersionId` / `latestVersionId` 因 Drizzle 循环引用而省略了 DB FK，仅靠应用层保证（schema 注释已说明）。后果是悬挂引用在 DB 层无保护。建议用 `AnyPgColumn` 类型注解保留 `references()`，或在迁移里补一个 deferrable FK。

**风险 2 — revision 内存储 `content_html`（中）**：这是 D1 的缓存决策，但与 P3「HTML 永远是派生、管线可插拔/Sacred」存在张力。管线升级后，历史修订的 `content_html` 不会自动重渲染，且当前**没有重渲染机制，也没记录渲染时的 pipeline 版本**。建议：在 revision 上记 `pipeline_version`，并提供一个「按 hash 重建 HTML」的 job，使存储 HTML 真正只是可重建缓存。

**已知缺口（按 plan 明确推迟，可接受）**：`translation_group_id`、redirect 表、全文检索 `tsvector`。注意 mandate 把「保存时建全文索引」列为硬性要求，未来切片需补。

---

## 三、权限（良好）

- 单一 `can(actor, action, resource)` chokepoint，**admin 能力建模在 can() 内部**、数据函数无硬编码 admin bypass——精确符合 P4 与 Permission mandate 的核心不变量。
- 每个 service 入口都接收并强制 `PermCtx`；`listPublished` 通过 join `currentPublishedVersionId` 从查询层面就排除草稿，readers/anonymous 不可能看到草稿——好。
- 与三轴模型（subject×resource×action + deny>allow>parent>space>global）差距很大，但属 plan 明确 scoped 推迟，机制已在位、扩展只需改一处函数，可接受。

**小问题**：
- `getLive` 读单页时用 `{ kind: 'page_list' }` 作 read 资源，且 `read` 分支根本没用到 `pageId`——语义偏糙，未来加 per-page override 时容易踩坑。
- `getHistory` 对任意已登录用户（含 reader）返回所有 published 修订，而 data-model 权限矩阵里 reader 看历史标的是「own?」——行为比矩阵略宽，需确认是有意还是偏差。

---

## 四、渲染管线（中）

- **未实现 P3 要求的「可插拔注册表 + 每步 typed 契约 + 从第一天起可插拔」**。`renderMarkdown` 是一条硬编码 `unified().use(...)` 链，功能正确但不是注册表式管线；plan 却把 Rendering Pipeline 标 PASS。这是 P3「Sacred」级别原则，建议要么补一个最小注册表，要么在 plan 里诚实标注为 scoped。
- **安全（建议安全复查）**：`rehypeSanitize` 排在 `rehypeKatex` / `rehypeHighlight` **之前**，意味着 KaTeX / highlight 生成的 HTML **不经过消毒**。KaTeX 在默认非 trust 配置下通常安全，但这条顺序把消毒边界放在了用户可影响的输出之前。更稳妥：sanitize 放在链尾，或对 katex/highlight 输出使用扩展 schema 再消毒一次。
- `wrapCodeBlocks` 用 `node.data` 两段式 mutation 改写 AST，较脆且可读性差；`processSync` 同步渲染对 MVP 可接受，但与未来异步化（P6）有张力。

---

## 五、服务层 / 编码（良好，少量）

- 业务逻辑集中在 `services/`，`create` / `newDraft` / `publish` 都在 `db.transaction` 内、版本号 `max+1` 在同事务计算——正确。`DomainError` + 统一错误码映射清晰。
- **并发 version 冲突未处理（中）**：`newDraft` 用 `max(versionNumber)+1`，两个并发草稿会撞 `(page_id, version_number)` 唯一约束。目前无重试，并发下直接抛 500。虽已声明 last-write-wins，但「版本号竞态」需要捕获唯一冲突并重试或转成清晰错误。
- **轻微 N+1**：`getLive` 顺序 `await` page→revision→author 三次查询，可合并为一次 join（`listPublished` / `getHistory` 已用 join，风格不统一）。

---

## 六、前端数据流（良好）

- TanStack Query 已正确接入（`provider.tsx` + `useApiMutation` 封装），符合数据流契约；Zustand 已装未用（暂无共享 UI 态，合理待命）。
- Server Component 直接调 service 并构造/传入 `PermCtx`；client 组件仅做 **type-only** 引入 server（`Header.tsx` 引 `type Actor`），未泄漏服务端代码到浏览器——符合 project-structure 边界。
- 小味道：共享 `components/layout/Layout.tsx`（RSC）内做 service 调用 + `redirect`，而非把取数放在 route shell。RSC 下合法，但与「`app/` 是 route shell、取数在 shell」的结构意图略有出入。

---

## 优先级清单

**高（建议本轮处理）**
1. 消除编辑器 / 认证 / API 三处技术决策漂移：每处二选一（改实现 or 修宪+更新 plan）。先把宪法内部 Toast UI vs Tiptap 的矛盾解决。
2. 修正 plan 的 Constitution Check，使 PASS 描述与代码一致（Editor / P8 / 渲染管线 / 数据流）。

**中**
3. `newDraft` 处理 version_number 并发唯一冲突（捕获重试 / 明确错误）。
4. 渲染管线消毒顺序复查（sanitize 置后或对 katex/highlight 输出再消毒）。
5. `pages` 两个 version 外键补 DB 级约束（`AnyPgColumn` 或 deferrable FK）。
6. `content_html` 加 `pipeline_version` + 重渲染 job，落实「HTML 仅为可重建缓存」。

**低**
7. `getLive` 合并查询消除 N+1；read 权限资源语义收紧（用 `page` 而非 `page_list`）。
8. 修正 plan 中「pg-boss is wired」表述（实际未安装）。
9. 确认 `getHistory` 对 reader 的可见范围是否符合权限矩阵「own?」。

---

## 一句话总结

代码本身写得稳、模型设计合理、核心不变量（权限 chokepoint、不可变版本、事务、RSC 边界）都到位；真正的风险是**治理文档已经追不上实现**——固定技术决策被悄悄替换且自评仍标 PASS。先让文档与代码重新一致，其余都是可控的局部改进。
