"""Safe standalone and active-provider commands for next-wiki memory."""

from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path
from typing import Sequence

from .api_client import ApiClientError, WikiApiClient
from .config import API_KEY_ENV_VAR, ProviderConfig, configured_api_key, load_config, save_config, validate_wiki_api_base_url
from .redaction import redact, safe_url


def _hermes_home(value: str | None) -> Path:
    return Path(value or os.environ.get("HERMES_HOME", ".hermes")).expanduser()


def _print_status(home: Path) -> int:
    try:
        config = load_config(home)
    except ValueError as error:
        print(redact(error))
        return 2
    if not config:
        print("next-wiki memory is not configured; run hermes memory setup or next-wiki-hermes-memory init")
        return 2
    print(f"Wiki API: {safe_url(config.wiki_api_base_url)}")
    print(f"Capture enabled: {'yes' if config.capture_enabled else 'no'}")
    print(f"Strict checkpoint: {'yes' if config.strict_checkpoint_enabled else 'no'}")
    print(f"API key configured: {'yes' if configured_api_key() else 'no'}")
    return 0


def _check(home: Path) -> int:
    try:
        config = load_config(home)
        if not config:
            raise ValueError("next-wiki memory is not configured; run init first")
        result = WikiApiClient(config).diagnostics()
        print(f"next-wiki memory: {result.get('status', 'healthy')}")
        print(f"Wiki API: {safe_url(config.wiki_api_base_url)}")
        return 0
    except (ValueError, ApiClientError) as error:
        print(redact(error))
        return 2


def _init(args: argparse.Namespace) -> int:
    value = args.wiki_url or input("next-wiki API URL (ending in /api/v1): ").strip()
    try:
        url = validate_wiki_api_base_url(value)
    except ValueError as error:
        print(redact(error))
        return 2
    home = _hermes_home(args.hermes_home)
    config = ProviderConfig(wiki_api_base_url=url, capture_enabled=args.capture_enabled)
    key = configured_api_key()
    if not key and not args.skip_check and os.isatty(0):
        key = getpass.getpass(f"{API_KEY_ENV_VAR} (not saved here; leave blank to skip check): ").strip() or None
    if args.dry_run:
        print(f"Would write non-secret configuration to {save_config(home, config, dry_run=True)}")
    else:
        print(f"Wrote non-secret configuration to {save_config(home, config)}")
    if args.skip_check or not key:
        print("Connection check skipped. Set the key through Hermes memory setup, then run hermes next-wiki check.")
        return 0
    try:
        WikiApiClient(config, api_key=key).diagnostics()
        print("Connection check succeeded.")
        return 0
    except ApiClientError as error:
        print(redact(error))
        return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="next-wiki-hermes-memory", description="Prepare or diagnose next-wiki Hermes memory")
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init", help="write non-secret provider configuration")
    init.add_argument("--wiki-url", help="versioned next-wiki API URL; no credential arguments are accepted")
    init.add_argument("--hermes-home", help="Hermes home supplied by the active profile")
    init.add_argument("--capture-enabled", action="store_true", help="opt in to user/assistant evidence capture")
    init.add_argument("--dry-run", action="store_true", help="show the target configuration without writing it")
    init.add_argument("--skip-check", action="store_true", help="do not prompt for or use a key for connectivity validation")
    for command in ("status", "check"):
        child = subparsers.add_parser(command, help=f"{command} active next-wiki memory configuration")
        child.add_argument("--hermes-home", help="Hermes home supplied by the active profile")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "init":
        return _init(args)
    home = _hermes_home(args.hermes_home)
    return _print_status(home) if args.command == "status" else _check(home)


def register_cli(subparsers: Any) -> None:
    """Hook used by active Hermes providers to add ``hermes next-wiki`` commands."""
    parser = subparsers.add_parser("next-wiki", help="next-wiki memory status and diagnostics")
    parser.add_argument("command", choices=["status", "check"])

    def run(args: Any) -> int:
        home = _hermes_home(getattr(args, "hermes_home", None))
        return _print_status(home) if args.command == "status" else _check(home)

    parser.set_defaults(handler=run)
