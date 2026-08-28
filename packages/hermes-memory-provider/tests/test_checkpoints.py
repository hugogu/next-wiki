from __future__ import annotations

import pytest

from next_wiki_memory import NextWikiMemoryProvider
from next_wiki_memory.config import ProviderConfig, save_config


class _CheckpointClient:
    def submit_evidence(self, _payload):
        return {"captureId": "capture"}

    def capture_status(self, _capture_id):
        return {"status": "durable", "durable": True, "evidence": {"evidenceId": "evidence"}}


def test_strict_checkpoint_returns_only_after_durable_capture(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", strict_checkpoint_enabled=True))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="primary")
    monkeypatch.setattr(provider, "_client", lambda: _CheckpointClient())

    assert provider.on_pre_compress([{"role": "user", "content": "preserve this"}]) == {"checkpoint": "evidence"}


def test_strict_checkpoint_fails_closed_when_not_durable(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1", strict_checkpoint_enabled=True, request_timeout_seconds=1))
    provider = NextWikiMemoryProvider()
    provider.initialize("session", hermes_home=tmp_path, agent_context="primary")

    class FailedClient(_CheckpointClient):
        def capture_status(self, _capture_id):
            return {"status": "failed", "durable": False}

    monkeypatch.setattr(provider, "_client", lambda: FailedClient())
    with pytest.raises(RuntimeError, match="could not preserve"):
        provider.on_pre_compress([{"role": "assistant", "content": "preserve this"}])
