# Markdown 后缀导出设计

日期：2026-07-24

## 目标

所有页面查看 URL 支持在末尾追加 `.md`，直接返回该页面的原始 Markdown 源码，HTTP 响应 Content-Type 为 `text/markdown; charset=utf-8`。

覆盖范围：wiki、generated、raw 三个空间的原生页与链接页，以及翻译页。

## 支持的 URL 形式

| 类型 | 示例 |
|------|------|
| 公开 wiki 原页 | `/path/to/page.md` |
| 公开 wiki 翻译页 | `/zh/path/to/page.md` |
| wiki 空间页 | `/spaces/wiki/path/to/page.md` |
| generated 空间页 | `/spaces/generated/path/to/page.md` |
| raw 空间页 | `/spaces/raw/path/to/page.md` |

## 实现方案

在现有 App Router 页面组件中内联检测 `.md` 后缀：

1. 等待 `params`。
2. 检查路径最后一个 segment 是否以 `.md` 结尾。
3. 若是，去掉该后缀，使用已有逻辑解析页面（包括翻译、链接目标等）。
4. 通过服务端服务获取 `contentSource`。
5. 返回 `new Response(contentSource, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })`。
6. 若否，继续返回 JSX 渲染 HTML 页面。

涉及路由：
- `apps/web/app/(public)/[...path]/page.tsx`
- `apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx`

新增共享 helper：`src/lib/markdown-export.ts`（或类似位置），提供：
- 路径后缀检测与剥离。
- 根据页面类型解析最终 markdown 源（原生页直接返回；链接页跟随目标）。
- raw 非 markdown 判断。

## 页面类型处理

| 页面类型 | 行为 |
|----------|------|
| 原生 wiki/generated/raw | 返回 `contentSource` |
| raw 非 markdown（`contentType !== 'text/markdown'`） | 返回 406 Not Acceptable |
| 链接页（link page） | 跟随 `linkTargetPageId`，返回目标 generated 页的 `contentSource`；目标不可访问时返回 404 |
| 翻译页 | 返回对应翻译版本的 `contentSource` |

## 权限

沿用现有 HTML 查看页面的权限模型：
- 公开页面使用匿名上下文。
- `spaces/*` 页面要求 admin 登录并启用 LLM Wiki 模式。

## 测试

- 单元测试：路径后缀解析 helper。
- 集成测试：
  - wiki/generated/raw markdown 页 `.md` 返回正确 Content-Type 与 body。
  - raw 非 markdown 返回 406。
  - 链接页 `.md` 返回目标页 markdown。
  - 翻译页 `.md` 返回翻译版本 markdown。
  - 不存在的路径 `.md` 返回 404。
