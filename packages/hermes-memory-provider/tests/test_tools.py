from __future__ import annotations

import json

from next_wiki_memory import NextWikiMemoryProvider
from next_wiki_memory.config import ProviderConfig, save_config


class _ToolClient:
    def recall(self, query: str, limit: int):
        return {"results": [{"memoryId": "one", "citation": {"revisionId": "revision"}}], "query": query, "limit": limit}

    def save(self, payload):
        return {"record": {"memoryId": "one"}, "idempotent": False}

    def forget(self, memory_id: str, reason: str | None):
        return {"memoryId": memory_id, "state": "forgotten"}


def test_tool_dispatch_rejects_unbounded_or_unknown_arguments(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path)
    monkeypatch.setattr(provider, "_client", lambda: _ToolClient())

    ok = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "decision"}))
    assert ok["ok"] is True
    assert ok["results"][0]["citation"]["revisionId"] == "revision"

    rejected = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "x" * 4_001}))
    assert rejected["ok"] is False
    extra = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "decision", "agent_identity": "other"}))
    assert extra["ok"] is False
    unknown = json.loads(provider.handle_tool_call("memory_search", {"query": "decision"}))
    assert unknown["code"] == "unknown_tool"
