#!/usr/bin/env python3
"""Find positions in a Markdown page where a link may safely be inserted.

REFERENCE MATERIAL. next-wiki does not execute skill scripts — this file is
shown to the model and to administrators as text. It exists because the
positional rules in reference/link-rules.md are easy to state and easy to get
wrong, and a worked implementation is clearer than more prose.

Usage (outside next-wiki):
    python3 find_linkable.py page.md "backup policy" "retention"
"""

import re
import sys

FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^#{1,6}\s")
INLINE_CODE = re.compile(r"`[^`]*`")
MD_LINK = re.compile(r"\[[^\]]*\]\([^)]*\)")
BARE_URL = re.compile(r"https?://\S+")
HTML_TAG = re.compile(r"<[^>]+>")


def masked(line: str) -> str:
    """Blank out every span a link must not be inserted into.

    Replacing with spaces rather than deleting keeps column offsets intact, so a
    match found in the masked line is at the same position in the original.
    """
    for pattern in (MD_LINK, INLINE_CODE, BARE_URL, HTML_TAG):
        line = pattern.sub(lambda match: " " * len(match.group(0)), line)
    return line


def linkable_positions(source: str, term: str) -> list[tuple[int, int]]:
    """Return (line_number, column) for each safe occurrence, first-match-only."""
    pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
    in_fence = False
    in_frontmatter = False
    for index, line in enumerate(source.splitlines(), start=1):
        if index == 1 and line.strip() == "---":
            in_frontmatter = True
            continue
        if in_frontmatter:
            if line.strip() == "---":
                in_frontmatter = False
            continue
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence or HEADING.match(line):
            continue
        match = pattern.search(masked(line))
        if match:
            # First safe occurrence only: the link exists so a reader can go
            # find out once, not so every mention becomes a link.
            return [(index, match.start())]
    return []


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as handle:
        source = handle.read()
    for term in sys.argv[2:]:
        positions = linkable_positions(source, term)
        if positions:
            line, column = positions[0]
            print(f"{term!r}: line {line}, column {column}")
        else:
            print(f"{term!r}: no safe position")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
