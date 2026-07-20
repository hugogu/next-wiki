# Mermaid Diagram Zoom Popup - Design

## Goal

Add the ability to view a mermaid diagram in a standalone popup that supports
convenient zoom and drag panning, so large/dense diagrams can be inspected
without overflowing the page reading column.

## Context

- `MermaidBlock.tsx` renders the diagram/code toggle for each ```mermaid fenced
  block, via a React island mounted by `ContentRenderer`.
- `ModalDialog.tsx` is the project-wide modal primitive (Escape/backdrop close,
  focus management), reused by 11+ dialogs.
- `MathPlotLayer.tsx` is the established pattern for "decorate rendered HTML
  with a hover icon that opens a modal".
- `CodeBlock.tsx` defines the hover-icon pattern (`opacity-0 group-hover:opacity-100`
  absolutely-positioned icon button in the top-right corner).
- No zoom/pan library is installed. `AGENTS.md` prefers public libs over
  hand-rolling. `react-zoom-pan-pinch` is mature (~7KB), React 19-compatible,
  and provides wheel zoom, drag pan, pinch, double-click zoom, and a
  `TransformComponent` that wraps arbitrary content.

## Design

### New dependency

`react-zoom-pan-pinch` added to `apps/web/package.json` dependencies.

### New icon

`ExpandIcon` in `apps/web/src/components/icons/index.tsx` - a four-corner
expand/maximize icon (Lucide `maximize-2` shape), matching the existing
`Icon` wrapper style.

### Trigger UI (in MermaidBlock.tsx)

- Wrap the diagram container in a `group` div (same pattern as `CodeBlock`).
- Add an `ExpandIcon` button absolutely positioned top-right of the diagram
  area, `opacity-0 group-hover:opacity-100`, visible only on hover (matches
  `CodeBlock`'s Copy button pattern).
- The existing Diagram/Code toggle buttons stay as text buttons in the header
  row above the diagram; the Expand icon sits on the diagram canvas itself,
  not in the toggle row.
- Clicking Expand opens the modal. Modal can be opened from diagram mode only.

### MermaidZoomModal component

New file: `apps/web/src/components/renderer/MermaidZoomModal.tsx`

Structure:

```
<ModalDialog title onClose maxWidth="max-w-6xl">
  <Toolbar>
    <button>Zoom In</button>
    <button>Zoom Out</button>
    <button>Reset</button>
  </Toolbar>
  <TransformWrapper
    minScale={0.2}
    maxScale={4}
    centerOnInit
    limitToBounds={false}
  >
    <TransformComponent>
      <div ref={containerRef}>
        <pre className="mermaid">{source}</pre>
      </div>
    </TransformComponent>
  </TransformWrapper>
</ModalDialog>
```

Key decisions:

1. **Independent mermaid render, not SVG clone**: mermaid generates
   incrementing ids (`mermaid-0`, `mermaid-1`...); cloning the rendered SVG
   would duplicate ids. The modal renders its own `<pre className="mermaid">`
   node and calls `mermaid.run` on it in a dedicated `useEffect`, reusing
   `mermaidThemeVariables()` for theme consistency.

2. **Reuse ModalDialog**: provides Escape key, backdrop click close, focus
   management, ARIA. Pass `maxWidth="max-w-6xl"` so the canvas is wide.
   `ModalDialog`'s panel uses `overflow-auto`; we wrap content in a
   `TransformComponent` which has its own `overflow-hidden`, so the modal's
   scroll doesn't fight the pan.

3. **Zoom controls**: a small toolbar above the canvas with Zoom In / Zoom
   Out / Reset buttons, wired to `react-zoom-pan-pinch`'s `useControls` hook
   (via `useTransformInit`/`useControls` from the `TransformWrapper` children
   render-prop context). Plus wheel + drag + double-click all work natively.

4. **Scale bounds**: `minScale=0.2`, `maxScale=4`, `limitToBounds=false` so a
   zoomed-in diagram can be dragged freely beyond viewport bounds (essential
   for very large diagrams).

### i18n keys (added to keys.ts, en.json, zh.json)

- `renderer.mermaid.expandButton` - aria-label/title for the Expand icon
- `renderer.mermaid.modalTitle` - modal title ("Diagram")
- `renderer.mermaid.modalDescription` - modal description (mentions zoom/pan)
- `renderer.mermaid.zoomIn` - zoom in button aria-label
- `renderer.mermaid.zoomOut` - zoom out button aria-label
- `renderer.mermaid.reset` - reset button aria-label

### Error handling

- If `mermaid.run` throws inside the modal, fall back to showing the raw
  `source` in a `<CodeBlock>` inside the modal (same behavior as diagram
  mode failing inline).
- Modal remains closable regardless of render success.

### Files changed

| File | Change |
|---|---|
| `apps/web/package.json` | add `react-zoom-pan-pinch` dependency |
| `apps/web/src/components/icons/index.tsx` | add `ExpandIcon` |
| `apps/web/src/components/renderer/MermaidZoomModal.tsx` | new file |
| `apps/web/src/components/renderer/MermaidBlock.tsx` | add Expand button + modal state |
| `apps/web/src/i18n/keys.ts` | add 6 keys under `renderer.mermaid.*` |
| `apps/web/messages/en.json` | add English strings |
| `apps/web/messages/zh.json` | add Chinese strings |

### Testing

- `pnpm --filter @next-wiki/web typecheck`
- `pnpm --filter @next-wiki/web lint`
- `pnpm --filter @next-wiki/web test` (existing mermaid tests if any)
- Manual: render a large mermaid diagram, hover to reveal Expand icon, click,
  verify zoom (wheel/buttons/double-click), pan (drag), reset, and Escape/backdrop close.

### Out of scope

- Fullscreen API (browser native fullscreen) - not needed; modal is enough.
- Exporting the zoomed view as PNG - separate feature.
- Touch gesture tuning beyond library defaults.
