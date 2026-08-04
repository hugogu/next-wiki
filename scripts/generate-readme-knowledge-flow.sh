#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="$repo_root/docs/diagrams/knowledge-flow.md"
output_file="$repo_root/docs/imgs/knowledge-flow.png"
image_gen="${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/image_gen.py"

if [[ ! -f "$image_gen" ]]; then
  echo "Image generation CLI not found: $image_gen" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY must be set to regenerate $output_file" >&2
  exit 1
fi

cd "$repo_root"
python "$image_gen" generate \
  --prompt-file "$source_file" \
  --size 2048x1152 \
  --quality high \
  --out "$output_file" \
  --force
