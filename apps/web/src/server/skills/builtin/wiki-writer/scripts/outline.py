#!/usr/bin/env python3
"""Print the heading outline of a Markdown page.

REFERENCE MATERIAL. next-wiki does not execute skill scripts — this file is
shown to the model and to administrators as text. It is here to make the
"gaps" step of the Wiki Writer procedure concrete, and to give anyone adapting
the skill something to copy.

Usage (outside next-wiki):
    python3 outline.py page.md
"""

import re
import sys

HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
FENCE = re.compile(r"^\s*(```|~~~)")


def outline(source: str) -> list[tuple[int, str]]:
    """Return (level, text) for each heading outside fenced code blocks."""
    headings: list[tuple[int, str]] = []
    in_fence = False
    for line in source.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = HEADING.match(line)
        if match:
            headings.append((len(match.group(1)), match.group(2).strip()))
    return headings


def gaps(headings: list[tuple[int, str]]) -> list[str]:
    """Flag structural problems worth fixing while expanding a page."""
    problems: list[str] = []
    if not headings:
        return ["The page has no headings."]
    if headings[0][0] != 1:
        problems.append("The page does not start at heading level 1.")
    for (previous_level, _), (level, text) in zip(headings, headings[1:]):
        if level > previous_level + 1:
            problems.append(f"Heading level jumps to {level} at {text!r}.")
    return problems


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as handle:
        source = handle.read()
    headings = outline(source)
    for level, text in headings:
        print(f"{'  ' * (level - 1)}- {text}")
    for problem in gaps(headings):
        print(f"! {problem}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
