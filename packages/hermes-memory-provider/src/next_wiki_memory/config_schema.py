"""Desktop and CLI configuration declarations generated from one source."""

from __future__ import annotations

from .config import FIELD_DEFINITIONS, configured_api_key


def get_config_schema() -> dict[str, object]:
    return {
        "title": "next-wiki memory",
        "fields": [dict(field) for field in FIELD_DEFINITIONS],
    }


def get_desktop_config_schema() -> dict[str, object]:
    fields: list[dict[str, object]] = []
    for field in FIELD_DEFINITIONS:
        copied = dict(field)
        if copied.get("secret"):
            copied.pop("default", None)
            copied["is_set"] = configured_api_key() is not None
        fields.append(copied)
    return {"title": "next-wiki memory", "fields": fields}
