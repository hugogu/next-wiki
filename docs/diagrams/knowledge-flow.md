# README knowledge-flow graphic

This file is the editable source of truth and the prompt for
`docs/imgs/knowledge-flow.png`. Keep its labels, capability states, and flow
accurate before regenerating the image with
`scripts/generate-readme-knowledge-flow.sh`.

## Purpose

Show how next-wiki turns human and machine-created content into governed,
durable knowledge. The graphic is for the English README, so all visible copy
is English. It must communicate the difference between capabilities available
now and planned connectors without relying on color alone.

## Capability states

- **Available (solid blue):** Human editing; Wiki AI generation; Channel
  conversations (Feishu); Wiki.js import; Evidence & provenance; Permissions &
  revisions; AI retrieval & synthesis; Human review; Search & embeddings;
  Collaborative Wiki; Share pages; AI knowledge base; AI memory storage; and
  GitHub Pages static publishing.
- **Planned (amber dashed/outlined):** Confluence, Obsidian, and Notion
  import connectors.

## Required information architecture

Use three left-to-right columns, with arrows flowing from every Capture card to
the central next-wiki card, then to every Use & Publish card:

1. **CAPTURE** — Human editing; Wiki AI generation; Channel conversations
   (Feishu); Wiki.js import; and a **PLANNED CONNECTORS** group containing
   Confluence, Obsidian, and Notion.
2. **GOVERN & ENRICH** — `next-wiki`, subtitled `Self-hosted knowledge layer`,
   with Evidence & provenance; Permissions & revisions; AI retrieval &
   synthesis; Human review; and Search & embeddings.
3. **USE & PUBLISH** — Collaborative Wiki; Share pages; AI knowledge base; AI
   memory storage; and GitHub Pages, subtitled `Static publishing`.

## Image-generation prompt

Use case: infographic-diagram

Asset type: README product overview graphic for an open-source, self-hosted,
AI-native wiki

Primary request: Create a polished, highly legible landscape architecture
infographic that explains a knowledge-flow product. It must be usable directly
in a GitHub README at a 16:9 ratio.

Scene/backdrop: Clean off-white / very pale blue technical-paper background;
thin navy and cyan connecting lines; no gradients that reduce contrast.

Composition/framing: Three clearly separated vertical columns with generous
whitespace, left-to-right flow. Use this exact title across the top: "From
conversations and content to durable knowledge". At the top right include a
small legend: a solid blue dot labelled "AVAILABLE" and an outlined amber dot
labelled "PLANNED". Every label must be crisp, correctly spelled, in a modern
neutral sans-serif, and readable at ordinary README width.

Column 1 heading, exact: "CAPTURE". Stack four rounded cards with simple line
icons and exact labels: "Human editing", "Wiki AI generation", "Channel
conversations (Feishu)", and "Wiki.js import". Below them, an outlined amber
dashed grouping labelled exactly "PLANNED CONNECTORS" containing three small
outlined cards: "Confluence", "Obsidian", and "Notion".

Column 2 heading, exact: "GOVERN & ENRICH". Put one tall central product card
titled exactly "next-wiki" with subtitle exactly "Self-hosted knowledge layer".
Inside it, show five compact rows with icons and exact labels: "Evidence &
provenance", "Permissions & revisions", "AI retrieval & synthesis", "Human
review", and "Search & embeddings". Use solid blue/teal treatment to indicate
available. Arrows from every Capture card flow into it.

Column 3 heading, exact: "USE & PUBLISH". Show five solid blue available cards
with exact labels: "Collaborative Wiki", "Share pages", "AI knowledge base",
"AI memory storage", and "GitHub Pages". The GitHub Pages card must have the
subtitle exactly "Static publishing". Arrows flow out from next-wiki to every
output card.

Style/medium: Premium SaaS product infographic; precise vector-like line art
and UI cards; semantic blue (#1769E0) for available, muted amber (#B86B00) for
planned, dark navy type, cyan accents, light background.

Constraints: Professional, calm, technical, and extremely readable. Distinguish
available versus planned with both color and solid-versus-dashed/outlined
treatment. Do not use vendor logos, a watermark, a mock browser UI, people, or
extra claims. Use all stated labels exactly; do not add text beyond the title,
headings, legend, labels, and required subtitles.
