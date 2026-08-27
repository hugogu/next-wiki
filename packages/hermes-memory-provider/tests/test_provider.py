from __future__ import annotations

import json

import pytest

from next_wiki_memory import NextWikiMemoryProvider, register
from next_wiki_memory.config import ProviderConfig, save_config

class _Context:
    def __init__(self) -> None:
        self.providers: list[object] = []

    def register_memory_provider(self, provider: object) -> None:
        self.providers.append(provider)


class _Client:
    def recall(self, query: str, limit: int):
        return {"results": [{"query": query, "limit": limit}]}

    def save(self, payload):
        return {"record": {"memoryId": "saved"}, "idempotent": False, "payload": payload}

    def forget(self, memory_id: str, reason: str | None):
        return {"memoryId": memory_id, "reason": reason, "state": "forgotten"}


def test_register_and_provider_tools_are_namespaced(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", agent_identity="agent"))
    provider = NextWikiMemoryProvider()
    provider.initialize("session-1", hermes_home=tmp_path, agent_identity="agent", user_id_alt="user")
    monkeypatch.setattr(provider, "_client", lambda: _Client())

    context = _Context()
    register(context)
    assert len(context.providers) == 1
    names = [schema["function"]["name"] for schema in provider.get_tool_schemas()]
    assert names == ["next_wiki_memory_search", "next_wiki_memory_save", "next_wiki_memory_forget"]
    assert all("profile" not in schema["function"]["parameters"]["properties"] for schema in provider.get_tool_schemas())

    response = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "remember this", "limit": 2}))
    assert response == {"ok": True, "results": [{"query": "remember this", "limit": 2}]}


def test_provider_returns_redacted_safe_tool_failures(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))
    provider = NextWikiMemoryProvider()
    provider.initialize("session-1", hermes_home=tmp_path)

    response = provider.handle_tool_call("next_wiki_memory_save", {"content": ""})
    assert json.loads(response)["ok"] is False
    assert "nwk_test_secret" not in response


def test_provider_save_config_validates_and_normalizes_desktop_values(tmp_path) -> None:
    provider = NextWikiMemoryProvider()

    with pytest.raises(ValueError, match="HTTPS"):
        provider.save_config({"wiki_api_base_url": "http://wiki.example.com/api/v1"}, str(tmp_path))
    assert not (tmp_path / "next-wiki-memory.json").exists()

    provider.save_config({"wiki_api_base_url": "https://wiki.example.com/api/v1/"}, str(tmp_path))
    assert provider._config is not None
    assert provider._config.wiki_api_base_url == "https://wiki.example.com/api/v1"


def test_provider_rejects_a_host_identity_that_does_not_match_key_configuration(tmp_path) -> None:
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", agent_identity="hermes"))
    provider = NextWikiMemoryProvider()

    with pytest.raises(ValueError, match="does not match"):
        provider.initialize("session-1", hermes_home=tmp_path, agent_identity="mino")
