"""Versioned non-secret provider configuration and shared field declarations."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from urllib.parse import urlparse

CONFIG_VERSION = 1
CONFIG_FILENAME = "next-wiki-memory.json"
API_KEY_ENV_VAR = "NEXT_WIKI_MEMORY_API_KEY"

FIELD_DEFINITIONS: tuple[dict[str, object], ...] = (
    {
        "name": "wiki_api_base_url",
        "label": "next-wiki API URL",
        "type": "string",
        "required": True,
        "help": "Versioned next-wiki API URL, for example https://wiki.example.com/api/v1",
    },
    {
        "name": "api_key",
        "label": "Hermes memory API key",
        "type": "string",
        "required": True,
        "secret": True,
        "env_var": API_KEY_ENV_VAR,
        "help": "Create a dedicated key in next-wiki User Center → API Keys.",
    },
    {
        "name": "capture_enabled",
        "label": "Capture conversations",
        "type": "boolean",
        "default": False,
        "help": "Off by default. When enabled, only user/assistant evidence is captured.",
    },
)


@dataclass(frozen=True)
class ProviderConfig:
    wiki_api_base_url: str
    capture_enabled: bool = False
    strict_checkpoint_enabled: bool = False
    request_timeout_seconds: float = 5.0
    recall_limit: int = 5
    version: int = CONFIG_VERSION


def config_path(hermes_home: str | Path) -> Path:
    return Path(hermes_home).expanduser() / CONFIG_FILENAME


def validate_wiki_api_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a complete next-wiki API URL, including http:// or https://")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("The Wiki API URL must not contain credentials, a query, or a fragment")
    host = (parsed.hostname or "").lower()
    loopback = host in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not loopback:
        raise ValueError("Remote Wiki URLs must use HTTPS; use HTTP only for a local loopback development Wiki")
    path = parsed.path.rstrip("/")
    if not path.endswith("/api/v1"):
        raise ValueError("Use the versioned API base URL ending in /api/v1")
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def load_config(hermes_home: str | Path) -> ProviderConfig | None:
    path = config_path(hermes_home)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError("The next-wiki memory configuration is unreadable; run init again") from error
    if not isinstance(payload, dict) or payload.get("version") != CONFIG_VERSION:
        raise ValueError("The next-wiki memory configuration is unsupported; run init to migrate it")
    url = payload.get("wiki_api_base_url")
    if not isinstance(url, str):
        raise ValueError("The next-wiki memory configuration has no Wiki API URL")
    return ProviderConfig(
        wiki_api_base_url=validate_wiki_api_base_url(url),
        capture_enabled=bool(payload.get("capture_enabled", False)),
        strict_checkpoint_enabled=bool(payload.get("strict_checkpoint_enabled", False)),
        request_timeout_seconds=min(max(float(payload.get("request_timeout_seconds", 5.0)), 1.0), 30.0),
        recall_limit=min(max(int(payload.get("recall_limit", 5)), 1), 10),
        version=CONFIG_VERSION,
    )


def save_config(hermes_home: str | Path, config: ProviderConfig, *, dry_run: bool = False) -> Path:
    normalized_url = validate_wiki_api_base_url(config.wiki_api_base_url)
    if normalized_url != config.wiki_api_base_url:
        config = replace(config, wiki_api_base_url=normalized_url)
    path = config_path(hermes_home)
    if dry_run:
        return path
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(asdict(config), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    return path


def configured_api_key() -> str | None:
    value = os.environ.get(API_KEY_ENV_VAR, "").strip()
    return value or None
