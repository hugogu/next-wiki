from __future__ import annotations

import json

from next_wiki_memory import NextWikiMemoryProvider
from next_wiki_memory.config import ProviderConfig, save_config


class _ToolClient:
    def search_knowledge(self, query: str, limit: int):
        return {"results": [{"memoryId": "one", "citation": {"revisionId": "revision"}}], "query": query, "limit": limit}

    def get_knowledge_page(self, page_id: str, max_chars: int):
        return {"pageId": page_id, "content": "current", "maxChars": max_chars}

    def get_knowledge_page_by_url(self, url: str, max_chars: int):
        return {"pageId": "resolved-id", "content": "current", "url": url, "maxChars": max_chars}

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

    page = json.loads(provider.handle_tool_call("next_wiki_memory_get", {"page_id": "page-id", "max_chars": 100}))
    assert page == {"ok": True, "pageId": "page-id", "content": "current", "maxChars": 100}

    invalid_page = json.loads(provider.handle_tool_call("next_wiki_memory_get", {"page_id": "page-id", "max_chars": 20_001}))
    assert invalid_page["ok"] is False

    rejected = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "x" * 4_001}))
    assert rejected["ok"] is False
    extra = json.loads(provider.handle_tool_call("next_wiki_memory_search", {"query": "decision", "agent_identity": "other"}))
    assert extra["ok"] is False
    unknown = json.loads(provider.handle_tool_call("memory_search", {"query": "decision"}))
    assert unknown["code"] == "unknown_tool"


def test_tool_reads_user_url_without_search(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path)
    monkeypatch.setattr(provider, "_client", lambda: _ToolClient())
    url = "https://wiki.example.com/generated/article"
    result = json.loads(provider.handle_tool_call("next_wiki_memory_get", {"url": url, "max_chars": 1200}))
    assert result == {"ok": True, "pageId": "resolved-id", "content": "current", "url": url, "maxChars": 1200}
    for args in ({}, {"page_id": "p", "url": url}, {"url": "x" * 2049}, {"url": url, "max_chars": 20_001}):
        assert json.loads(provider.handle_tool_call("next_wiki_memory_get", args))["ok"] is False
