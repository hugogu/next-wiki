from __future__ import annotations

from next_wiki_memory import cli
from next_wiki_memory.config import ProviderConfig, config_path, save_config


def test_status_is_local_and_never_prints_the_secret(monkeypatch, tmp_path, capsys) -> None:
    save_config(tmp_path, ProviderConfig("https://wiki.example.com/api/v1"))
    monkeypatch.setenv("NEXT_WIKI_MEMORY_API_KEY", "nwk_cli_secret")

    assert cli.main(["status", "--hermes-home", str(tmp_path)]) == 0
    output = capsys.readouterr().out
    assert "API key configured: yes" in output
    assert "nwk_cli_secret" not in output


def test_init_dry_run_writes_nothing_and_does_not_accept_a_key(tmp_path, capsys) -> None:
    assert cli.main([
        "init", "--wiki-url", "https://wiki.example.com/api/v1", "--hermes-home", str(tmp_path), "--dry-run", "--skip-check",
    ]) == 0
    assert not config_path(tmp_path).exists()
    assert "Would write non-secret configuration" in capsys.readouterr().out
