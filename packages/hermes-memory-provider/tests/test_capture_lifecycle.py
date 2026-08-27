from __future__ import annotations

from next_wiki_memory import NextWikiMemoryProvider
from next_wiki_memory.config import ProviderConfig, save_config


def test_capture_is_opt_in_and_filters_tool_and_system_content(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="primary")
    captured: list[tuple[list[dict[str, str]], bool, bool]] = []
    monkeypatch.setattr(provider, "_submit", lambda operation: operation())
    monkeypatch.setattr(provider, "_capture", lambda messages, checkpoint, wait: captured.append((messages, checkpoint, wait)))

    provider.sync_turn([
        {"role": "system", "content": "never retain"},
        {"role": "tool", "content": "tool result"},
        {"role": "user", "content": "keep user"},
        {"role": "assistant", "content": "keep assistant"},
    ])

    assert captured == [([{"role": "user", "content": "keep user"}, {"role": "assistant", "content": "keep assistant"}], False, False)]


def test_non_primary_context_never_captures(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="delegated")
    monkeypatch.setattr(provider, "_submit", lambda _operation: (_ for _ in ()).throw(AssertionError("must not enqueue")))

    provider.sync_turn([{"role": "user", "content": "do not capture"}])
