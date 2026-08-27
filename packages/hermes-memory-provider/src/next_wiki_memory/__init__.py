"""Hermes MemoryProvider backed by next-wiki's destination-scoped REST API."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import uuid4

from .api_client import ApiClientError, WikiApiClient
from .config import ProviderConfig, configured_api_key, load_config, save_config
from .config_schema import get_config_schema
from .redaction import redact

_MAX_TOOL_QUERY = 4_000
_MAX_TOOL_CONTENT = 16_000
_MAX_TOOL_REASON = 500


class NextWikiMemoryProvider:
    """A no-network-at-discovery Hermes memory provider."""

    name = "next-wiki"
    pre_compress_checkpoint_api_version = 2

    def __init__(self) -> None:
        self._config: ProviderConfig | None = None
        self._hermes_home: str | None = None
        self._session_id: str | None = None
        self._agent_identity: str | None = None
        self._runtime_user_id: str | None = None
        self._primary_context = True
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="next-wiki-memory")
        self._pending: set[object] = set()
        self._pending_lock = threading.Lock()

    def is_available(self) -> bool:
        """Only inspect local config/secrets; Hermes discovery must not make HTTP calls."""
        try:
            if self._config is None:
                hermes_home = os.environ.get("HERMES_HOME")
                if hermes_home:
                    self._config = load_config(hermes_home)
            return self._config is not None and configured_api_key() is not None
        except Exception:
            return False

    def unavailable_reason(self) -> str:
        if self._config is None:
            return "Run hermes memory setup and select next-wiki to set the Wiki API URL"
        if configured_api_key() is None:
            return "Set NEXT_WIKI_MEMORY_API_KEY through Hermes memory setup, then run hermes next-wiki check"
        return "next-wiki memory is unavailable; run hermes next-wiki check"

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        hermes_home = kwargs.get("hermes_home")
        if not hermes_home:
            raise RuntimeError("Hermes did not provide hermes_home; re-run Hermes memory setup")
        self._hermes_home = str(hermes_home)
        self._config = load_config(self._hermes_home)
        self._session_id = session_id
        identity = kwargs.get("agent_identity")
        user_id = kwargs.get("user_id_alt") or kwargs.get("user_id")
        self._agent_identity = str(identity) if identity else None
        self._runtime_user_id = str(user_id) if user_id else None
        context = kwargs.get("agent_context")
        self._primary_context = context in (None, "primary") or (isinstance(context, dict) and context.get("primary") is True)

    def get_config_schema(self) -> dict[str, object]:
        return get_config_schema()

    def save_config(self, values: dict[str, object], hermes_home: str, **_: Any) -> None:
        url = values.get("wiki_api_base_url")
        if not isinstance(url, str):
            raise ValueError("Wiki API URL is required")
        config = ProviderConfig(
            wiki_api_base_url=url,
            capture_enabled=bool(values.get("capture_enabled", False)),
        )
        save_config(hermes_home, config)
        self._hermes_home = hermes_home
        self._config = config

    def get_tool_schemas(self, **_: Any) -> list[dict[str, object]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "next_wiki_memory_search",
                    "description": "Search only this Hermes profile's next-wiki memory destination.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "maxLength": _MAX_TOOL_QUERY},
                            "limit": {"type": "integer", "minimum": 1, "maximum": 10},
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "next_wiki_memory_save",
                    "description": "Explicitly save approved long-term memory to the bound next-wiki destination.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "content": {"type": "string", "maxLength": _MAX_TOOL_CONTENT},
                            "title": {"type": "string", "maxLength": 160},
                            "tags": {"type": "array", "items": {"type": "string", "maxLength": 64}, "maxItems": 10},
                        },
                        "required": ["content"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "next_wiki_memory_forget",
                    "description": "Reversibly forget one memory in the bound next-wiki destination.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "memory_id": {"type": "string"},
                            "reason": {"type": "string", "maxLength": _MAX_TOOL_REASON},
                        },
                        "required": ["memory_id"],
                        "additionalProperties": False,
                    },
                },
            },
        ]

    def handle_tool_call(self, name: str, args: dict[str, Any], **_: Any) -> str:
        try:
            client = self._client()
            if name == "next_wiki_memory_search":
                query = self._bounded_string(args.get("query"), _MAX_TOOL_QUERY, "query")
                limit = args.get("limit", self._config.recall_limit if self._config else 5)
                if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 10:
                    raise ValueError("limit must be between 1 and 10")
                return json.dumps({"ok": True, **client.recall(query, limit)}, ensure_ascii=False)
            if name == "next_wiki_memory_save":
                content = self._bounded_string(args.get("content"), _MAX_TOOL_CONTENT, "content")
                payload: dict[str, object] = {"idempotencyKey": str(uuid4()), "content": content}
                if "title" in args:
                    payload["title"] = self._bounded_string(args["title"], 160, "title")
                if "tags" in args:
                    tags = args["tags"]
                    if not isinstance(tags, list) or len(tags) > 10 or not all(isinstance(tag, str) and 0 < len(tag.strip()) <= 64 for tag in tags):
                        raise ValueError("tags must contain at most 10 short strings")
                    payload["tags"] = [tag.strip() for tag in tags]
                return json.dumps({"ok": True, **client.save(payload)}, ensure_ascii=False)
            if name == "next_wiki_memory_forget":
                memory_id = self._bounded_string(args.get("memory_id"), 128, "memory_id")
                reason = self._bounded_string(args["reason"], _MAX_TOOL_REASON, "reason") if "reason" in args else None
                return json.dumps({"ok": True, **client.forget(memory_id, reason)}, ensure_ascii=False)
            return self._safe_failure("unknown_tool", "This next-wiki memory tool is unavailable")
        except (ValueError, ApiClientError) as error:
            return self._safe_failure(getattr(error, "code", "invalid_request"), str(error))
        except Exception:
            return self._safe_failure("unavailable", "next-wiki memory is temporarily unavailable; run hermes next-wiki check")

    def prefetch(self, query: str, **_: Any) -> str:
        if not self.is_available():
            return self._safe_failure("unavailable", self.unavailable_reason())
        return self.handle_tool_call("next_wiki_memory_search", {"query": query, "limit": self._config.recall_limit if self._config else 5})

    def queue_prefetch(self, query: str, **kwargs: Any) -> None:
        self._submit(lambda: self.prefetch(query, **kwargs))

    def sync_turn(self, messages: list[Any] | None = None, **_: Any) -> None:
        if not self._config or not self._config.capture_enabled or not self._primary_context:
            return
        normalized = self._normalize_messages(messages or [])
        if not normalized:
            return
        self._submit(lambda: self._capture(normalized, checkpoint=False, wait=False))

    def on_session_switch(self, session_id: str, **_: Any) -> None:
        self._session_id = session_id

    def on_session_end(self, messages: list[Any] | None = None, **_: Any) -> None:
        self.sync_turn(messages)

    def on_pre_compress(self, messages: list[Any] | None = None, **_: Any) -> dict[str, object] | None:
        if not self._config or not self._config.strict_checkpoint_enabled:
            return None
        if not self._primary_context:
            raise RuntimeError("Strict next-wiki checkpoints are available only in the primary agent context")
        normalized = self._normalize_messages(messages or [])
        if not normalized:
            raise RuntimeError("No eligible user/assistant evidence exists for the required checkpoint")
        return self._capture(normalized, checkpoint=True, wait=True)

    def shutdown(self, **_: Any) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)

    def _client(self) -> WikiApiClient:
        if not self._config:
            raise ApiClientError("incomplete", self.unavailable_reason())
        return WikiApiClient(self._config)

    @staticmethod
    def _bounded_string(value: Any, maximum: int, name: str) -> str:
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
            raise ValueError(f"{name} must be a non-empty string no longer than {maximum} characters")
        return value.strip()

    @staticmethod
    def _safe_failure(code: str, message: str) -> str:
        return json.dumps({"ok": False, "code": redact(code), "message": redact(message)}, ensure_ascii=False)

    def _submit(self, operation: Any) -> None:
        future = self._executor.submit(operation)
        with self._pending_lock:
            self._pending.add(future)
        future.add_done_callback(self._discard_pending)

    def _discard_pending(self, future: object) -> None:
        with self._pending_lock:
            self._pending.discard(future)

    def _normalize_messages(self, messages: list[Any]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        for message in messages[-100:]:
            if isinstance(message, dict):
                role, content = message.get("role"), message.get("content")
            else:
                role, content = getattr(message, "role", None), getattr(message, "content", None)
            if role not in {"user", "assistant"} or not isinstance(content, str) or not content.strip():
                continue
            normalized.append({"role": role, "content": content.strip()[:64_000]})
        return normalized

    def _capture(self, messages: list[dict[str, str]], *, checkpoint: bool, wait: bool) -> dict[str, object] | None:
        session = self._session_id or "unknown-session"
        subject = ":".join(part for part in (self._agent_identity, self._runtime_user_id, session) if part)
        digest = hashlib.sha256(subject.encode("utf-8")).hexdigest()
        evidence = json.dumps(messages, separators=(",", ":"), ensure_ascii=False)
        idempotency = hashlib.sha256(f"{digest}:{checkpoint}:{evidence}".encode("utf-8")).hexdigest()
        client = self._client()
        submitted = client.submit_evidence({
            "idempotencyKey": idempotency,
            "sessionDigest": digest,
            "checkpoint": checkpoint,
            "messages": messages,
        })
        if not wait:
            return None
        capture_id = submitted.get("captureId")
        if not isinstance(capture_id, str):
            raise RuntimeError("The Wiki did not acknowledge a durable checkpoint request")
        deadline = time.monotonic() + min(self._config.request_timeout_seconds * 3, 30)
        while time.monotonic() < deadline:
            status = client.capture_status(capture_id)
            if status.get("durable") is True:
                return {"checkpoint": status.get("evidence", {}).get("evidenceId", capture_id)}
            if status.get("status") in {"failed", "cancelled"}:
                raise RuntimeError("The Wiki could not preserve the required checkpoint; restore the worker and retry")
            time.sleep(0.2)
        raise RuntimeError("Timed out waiting for the Wiki to preserve the required checkpoint")


def register(ctx: Any) -> None:
    """Hermes entry point declared in ``pyproject.toml``."""
    ctx.register_memory_provider(NextWikiMemoryProvider())
