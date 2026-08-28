from __future__ import annotations

import io
import json
from typing import Any
from urllib.error import HTTPError

import pytest

from next_wiki_memory.api_client import ApiClientError, WikiApiClient
from next_wiki_memory.config import ProviderConfig


class _Response:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_: Any) -> None:
        return None

    def read(self, amount: int = -1) -> bytes:
        body = json.dumps(self._payload).encode("utf-8")
        return body if amount < 0 else body[:amount]


class _TransportFixture:
    def __init__(
        self,
        payload: dict[str, Any] | None = None,
        error_status: int | None = None,
        error_body: bytes | None = None,
        error_headers: dict[str, str] | None = None,
    ) -> None:
        self.payload = payload or {"status": "healthy"}
        self.error_status = error_status
        self.error_body = error_body or b'{"raw":"nwk_do_not_echo"}'
        self.error_headers = error_headers or {}
        self.requests: list[Any] = []

    def open(self, request: Any, timeout: float):
        self.requests.append((request, timeout))
        if self.error_status:
            raise HTTPError(request.full_url, self.error_status, "fixture failure", self.error_headers, io.BytesIO(self.error_body))
        return _Response(self.payload)


def test_client_uses_scoped_api_routes_and_bearer_key() -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    transport = _TransportFixture()
    client._opener = transport  # type: ignore[assignment]

    assert client.diagnostics() == {"status": "healthy"}
    request, timeout = transport.requests[0]
    assert request.get_method() == "GET"
    assert request.full_url == "http://127.0.0.1:3000/api/v1/memory/diagnostics"
    assert request.get_header("Authorization") == "Bearer nwk_test_secret"
    assert request.get_header("User-agent") == "next-wiki-memory/0.1.4"
    assert request.get_header("X-next-wiki-memory-provider-version") == "0.1.4"
    assert timeout == 5.0


def test_client_never_echoes_an_error_response_body() -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    client._opener = _TransportFixture(error_status=403)  # type: ignore[assignment]

    with pytest.raises(ApiClientError) as error:
        client.diagnostics()

    assert error.value.code == "forbidden"
    assert "raw server detail" not in str(error.value)
    assert "nwk_" not in str(error.value)


def test_client_classifies_cloudflare_signature_bans_as_transport_errors() -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    client._opener = _TransportFixture(
        error_status=403,
        error_body=b'<html>Error 1010: browser_signature_banned</html>',
        error_headers={"Server": "cloudflare"},
    )  # type: ignore[assignment]

    with pytest.raises(ApiClientError) as error:
        client.diagnostics()

    assert error.value.code == "transport_blocked"
    assert "not a memory-scope error" in str(error.value)
    assert "browser_signature_banned" not in str(error.value)


@pytest.mark.parametrize(("status", "code"), [(401, "unauthorized"), (404, "not_found"), (426, "incompatible"), (302, "unavailable")])
def test_client_classifies_http_failures_without_raw_details(status: int, code: str) -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    client._opener = _TransportFixture(error_status=status)  # type: ignore[assignment]

    with pytest.raises(ApiClientError) as error:
        client.diagnostics()

    assert error.value.code == code
    assert "nwk_do_not_echo" not in str(error.value)
