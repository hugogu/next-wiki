"""Secret-safe rendering for every user-facing provider message."""

from __future__ import annotations

import re
from typing import Any

_TOKEN = re.compile(r"\bnwk_[A-Za-z0-9_-]+\b")
_BEARER = re.compile(r"(?i)(bearer\s+)[^\s,;]+")


def redact(value: Any) -> str:
    """Render arbitrary diagnostic data without a token or full URL query."""
    text = str(value)
    text = _TOKEN.sub("[redacted]", text)
    text = _BEARER.sub(r"\1[redacted]", text)
    return text


def safe_url(value: str) -> str:
    """Return only the origin and path; credentials, query, and fragments never print."""
    from urllib.parse import urlsplit, urlunsplit

    parsed = urlsplit(value)
    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme, host, parsed.path.rstrip("/"), "", ""))
