"""Desktop and CLI configuration declarations generated from one source."""

from __future__ import annotations

from .config import FIELD_DEFINITIONS, configured_api_key


def get_config_schema() -> list[dict[str, object]]:
    """Return the list shape expected by Hermes MemoryProvider setup/status.

    Hermes iterates this return value directly and reads ``secret``/``key``
    from each field. Keep the desktop wrapper separate because older Hermes
    desktop integrations expect a titled object with a ``fields`` member.
    """
    return [dict(field) for field in FIELD_DEFINITIONS]


def get_desktop_config_schema() -> dict[str, object]:
    """Return the titled schema used by the legacy desktop integration.

    The current Hermes setup contract uses ``key`` and ``description``. Keep
    the older display aliases in this separate wrapper so desktop clients that
    still read ``name``, ``label``, ``help``, or ``type`` do not break while
    the provider method remains strictly Hermes-compatible.
    """
    fields: list[dict[str, object]] = []
    for field in FIELD_DEFINITIONS:
        copied = dict(field)
        copied["name"] = copied["key"]
        copied["label"] = copied["description"]
        copied["help"] = copied["description"]
        copied["type"] = "boolean" if isinstance(copied.get("default"), bool) else "string"
        if copied.get("secret"):
            copied.pop("default", None)
            copied["is_set"] = configured_api_key() is not None
        fields.append(copied)
    return {"title": "next-wiki memory", "fields": fields}
