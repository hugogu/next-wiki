from __future__ import annotations

import json

import pytest

from next_wiki_memory.config import (
    LEGACY_CONFIG_FILENAME,
    ProviderConfig,
    config_path,
    load_config,
    save_config,
    validate_agent_identity,
    validate_wiki_api_base_url,
)
from next_wiki_memory.redaction import redact, safe_url


def test_url_validation_requires_versioned_https_or_loopback() -> None:
    assert validate_wiki_api_base_url("https://wiki.example.com/api/v1/") == "https://wiki.example.com/api/v1"
    assert validate_wiki_api_base_url("http://127.0.0.1:3000/api/v1") == "http://127.0.0.1:3000/api/v1"

    with pytest.raises(ValueError, match="HTTPS"):
        validate_wiki_api_base_url("http://wiki.example.com/api/v1")
    with pytest.raises(ValueError, match="ending in /api/v1"):
        validate_wiki_api_base_url("https://wiki.example.com")
    with pytest.raises(ValueError, match="credentials"):
        validate_wiki_api_base_url("https://key@wiki.example.com/api/v1")

    assert validate_agent_identity("hermes") == "hermes"
    with pytest.raises(ValueError):
        validate_agent_identity(" ")


def test_dry_run_never_writes_and_config_never_contains_a_secret(tmp_path) -> None:
    config = ProviderConfig("https://wiki.example.com/api/v1", capture_enabled=True)
    assert save_config(tmp_path, config, dry_run=True) == config_path(tmp_path)
    assert not config_path(tmp_path).exists()

    save_config(tmp_path, config)
    payload = json.loads(config_path(tmp_path).read_text())
    assert payload["wiki_api_base_url"] == "https://wiki.example.com/api/v1"
    assert "api_key" not in payload
    assert load_config(tmp_path) == config


def test_save_config_revalidates_urls_from_desktop_or_other_callers(tmp_path) -> None:
    with pytest.raises(ValueError, match="HTTPS"):
        save_config(tmp_path, ProviderConfig("http://wiki.example.com/api/v1"))

    with pytest.raises(ValueError, match="credentials"):
        save_config(tmp_path, ProviderConfig("https://secret@wiki.example.com/api/v1"))

    payload = {"version": 1, "wiki_api_base_url": "https://wiki.example.com/api/v1", "capture_enabled": "yes"}
    config_path(tmp_path).write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="capture_enabled"):
        load_config(tmp_path)


def test_legacy_config_filename_is_migrated_for_hermes_dashboard(tmp_path) -> None:
    legacy_path = tmp_path / LEGACY_CONFIG_FILENAME
    legacy_path.write_text(json.dumps({
        "version": 1,
        "wiki_api_base_url": "https://wiki.example.com/api/v1",
        "agent_identity": "hermes-memory",
        "capture_enabled": True,
    }))

    config = load_config(tmp_path)

    assert config is not None
    assert config.agent_identity == "hermes-memory"
    assert config_path(tmp_path).exists()
    assert json.loads(config_path(tmp_path).read_text())["wiki_api_base_url"] == "https://wiki.example.com/api/v1"
    assert legacy_path.exists()


def test_safe_rendering_removes_secrets_and_url_queries() -> None:
    secret = "nwk_very_secret_value"
    assert secret not in redact(f"Bearer {secret}")
    assert safe_url("https://user:password@wiki.example.com/api/v1?token=secret#fragment") == "https://wiki.example.com/api/v1"
