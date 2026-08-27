from __future__ import annotations

from next_wiki_memory.config import FIELD_DEFINITIONS
from next_wiki_memory.config_schema import get_config_schema, get_desktop_config_schema


def test_cli_and_desktop_schemas_share_the_same_field_declarations(monkeypatch) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    cli_fields = get_config_schema()["fields"]
    desktop_fields = get_desktop_config_schema()["fields"]

    assert cli_fields == [dict(field) for field in FIELD_DEFINITIONS]
    assert [field["name"] for field in desktop_fields] == [field["name"] for field in cli_fields]
    secret = next(field for field in desktop_fields if field["name"] == "api_key")
    assert secret["is_set"] is True
    assert "value" not in secret
