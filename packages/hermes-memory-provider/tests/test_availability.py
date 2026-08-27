from __future__ import annotations

from next_wiki_memory import NextWikiMemoryProvider
from next_wiki_memory.config import ProviderConfig, save_config


def test_availability_reads_only_local_configuration(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_test_secret")
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))

    provider = NextWikiMemoryProvider()
    assert provider.is_available() is True


def test_availability_is_false_with_missing_secret(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.delenv("NEXT_WIKI_MEMORY_API_KEY", raising=False)
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))

    assert NextWikiMemoryProvider().is_available() is False
