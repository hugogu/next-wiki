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
    monkeypatch.setattr(provider, "_capture", lambda messages, checkpoint, wait, **_: captured.append((messages, checkpoint, wait)))

    provider.sync_turn(
        "keep user",
        "keep assistant",
        session_id="host-session",
        messages=[
            {"role": "system", "content": "never retain"},
            {"role": "tool", "content": "tool result"},
            {"role": "user", "content": "keep user"},
            {"role": "assistant", "content": "keep assistant"},
        ],
    )

    assert captured == [([{"role": "user", "content": "keep user"}, {"role": "assistant", "content": "keep assistant"}], False, False)]


def test_async_capture_keeps_the_session_identity_across_a_session_switch(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("old-session", hermes_home=tmp_path, agent_context="primary")
    pending = []
    monkeypatch.setattr(provider, "_submit", lambda operation: pending.append(operation))
    captured = []
    monkeypatch.setattr(provider, "_capture", lambda messages, checkpoint, wait, **kwargs: captured.append(kwargs))

    provider.sync_turn([{"role": "user", "content": "old turn"}])
    provider.on_session_switch("new-session")
    pending.pop()()

    assert captured == [{
        "session_id": "old-session",
        "agent_identity": "hermes",
        "runtime_user_id": None,
    }]


def test_legacy_message_list_sync_signature_remains_supported(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="primary")
    captured = []
    monkeypatch.setattr(provider, "_submit", lambda operation: operation())
    monkeypatch.setattr(provider, "_capture", lambda messages, checkpoint, wait, **_: captured.append(messages))

    provider.sync_turn([{"role": "user", "content": "legacy call"}])

    assert captured == [[{"role": "user", "content": "legacy call"}]]


def test_non_primary_context_never_captures(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="delegated")
    monkeypatch.setattr(provider, "_submit", lambda _operation: (_ for _ in ()).throw(AssertionError("must not enqueue")))

    provider.sync_turn([{"role": "user", "content": "do not capture"}])
