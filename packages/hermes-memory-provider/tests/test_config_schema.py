from __future__ import annotations

from next_wiki_memory.config import FIELD_DEFINITIONS
from next_wiki_memory.config_schema import get_config_schema, get_desktop_config_schema


def test_cli_and_desktop_schemas_share_the_same_field_declarations(monkeypatch) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    cli_fields = get_config_schema()
    desktop_fields = get_desktop_config_schema()["fields"]

    assert cli_fields == [dict(field) for field in FIELD_DEFINITIONS]
    assert [field["key"] for field in desktop_fields] == [field["key"] for field in cli_fields]
    assert all(isinstance(field, dict) for field in cli_fields)
    secret = next(field for field in desktop_fields if field["key"] == "api_key")
    assert secret["is_set"] is True
    assert "value" not in secret
    assert secret["url"].startswith("https://github.com/hugogu/")
    assert secret["name"] == secret["key"]
    assert secret["label"] == secret["description"]
    assert secret["help"] == secret["description"]


def test_hermes_setup_schema_is_a_list_of_keyed_fields() -> None:
    schema = get_config_schema()

    assert isinstance(schema, list)
    assert [field["key"] for field in schema] == [
        "wiki_api_base_url",
        "api_key",
        "agent_identity",
        "capture_enabled",
    ]
    assert sum(bool(field.get("secret")) for field in schema) == 1
    assert "not MCP" in schema[0]["description"]
    assert "direct REST API" in schema[1]["description"]
