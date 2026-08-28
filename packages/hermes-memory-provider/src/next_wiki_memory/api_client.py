"""Bounded, Bearer-authenticated next-wiki Hermes-memory API client."""

from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .config import ProviderConfig, configured_api_key

PROVIDER_VERSION = "0.1.0"
MAX_RESPONSE_BYTES = 1_000_000


@dataclass(frozen=True)
class ApiClientError(Exception):
    code: str
    action: str

    def __str__(self) -> str:
        return self.action


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request: Request, fp: Any, code: int, message: str, headers: Any, newurl: str) -> None:
        del request, fp, code, message, headers, newurl
        return None


class WikiApiClient:
    def __init__(self, config: ProviderConfig, api_key: str | None = None) -> None:
        self._config = config
        self._api_key = api_key or configured_api_key()
        self._opener = build_opener(_NoRedirect())

    def _request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, Any]:
        if not self._api_key:
            raise ApiClientError("incomplete", "Set NEXT_WIKI_MEMORY_API_KEY through Hermes memory setup, then run check again")
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self._config.wiki_api_base_url}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Next-Wiki-Memory-Provider-Version": PROVIDER_VERSION,
            },
        )
        try:
            with self._opener.open(request, timeout=self._config.request_timeout_seconds) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ApiClientError("invalid_response", "The Wiki returned an oversized response; check the API URL and reverse proxy")
                parsed = json.loads(body.decode("utf-8"))
                return parsed if isinstance(parsed, dict) else {}
        except HTTPError as error:
            actions = {
                401: ("unauthorized", "The API key is invalid or revoked. Create or reveal a dedicated Hermes key and run setup again"),
                403: ("forbidden", "The key lacks a required memory scope or its destination is disabled. Check its scopes and binding"),
                404: ("not_found", "The requested memory record is unavailable in this destination"),
                409: ("not_durable", "The capture is not durable yet. Retry or wait for the Wiki worker"),
                426: ("incompatible", "Upgrade the next-wiki provider or Wiki to a compatible version"),
            }
            code, action = actions.get(error.code, ("unavailable", "The Wiki rejected the request. Check the Wiki status and run check again"))
            raise ApiClientError(code, action) from None
        except (URLError, socket.timeout, TimeoutError):
            raise ApiClientError("timeout", "The Wiki could not be reached. Check the URL, TLS, container network, and firewall") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiClientError("invalid_response", "The Wiki returned an invalid response. Check the API URL and reverse proxy") from None

    def connection(self) -> dict[str, Any]:
        return self._request("GET", "/memory/connection")

    def diagnostics(self) -> dict[str, Any]:
        return self._request("GET", "/memory/diagnostics")

    def recall(self, query: str, limit: int) -> dict[str, Any]:
        return self._request("POST", "/memory/recall", {"query": query, "limit": limit})

    def save(self, payload: dict[str, object]) -> dict[str, Any]:
        return self._request("POST", "/memory/records", payload)

    def forget(self, memory_id: str, reason: str | None = None) -> dict[str, Any]:
        return self._request("DELETE", f"/memory/records/{memory_id}", {"reason": reason} if reason else {})

    def submit_evidence(self, payload: dict[str, object]) -> dict[str, Any]:
        return self._request("POST", "/memory/evidence", payload)

    def capture_status(self, capture_id: str) -> dict[str, Any]:
        return self._request("GET", f"/memory/evidence/{capture_id}")
