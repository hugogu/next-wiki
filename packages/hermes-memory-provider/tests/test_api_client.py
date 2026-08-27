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

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class _TransportFixture:
    def __init__(self, payload: dict[str, Any] | None = None, error_status: int | None = None) -> None:
        self.payload = payload or {"status": "healthy"}
        self.error_status = error_status
        self.requests: list[Any] = []

    def open(self, request: Any, timeout: float):
        self.requests.append((request, timeout))
        if self.error_status:
            raise HTTPError(request.full_url, self.error_status, "fixture failure", {}, io.BytesIO(b'{"raw":"nwk_do_not_echo"}'))
        return _Response(self.payload)


def test_client_uses_scoped_api_routes_and_bearer_key() -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    transport = _TransportFixture()
    client._opener = transport  # type: ignore[assignment]

    assert client.diagnostics() == {"status": "healthy"}
    request, timeout = transport.requests[0]
    assert request.get_method() == "GET"
    assert request.full_url == "http://127.0.0.1:3000/api/v1/hermes/memory/diagnostics"
    assert request.get_header("Authorization") == "Bearer nwk_test_secret"
    assert request.get_header("X-next-wiki-hermes-provider-version") == "0.1.0"
    assert timeout == 5.0


def test_client_never_echoes_an_error_response_body() -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    client._opener = _TransportFixture(error_status=403)  # type: ignore[assignment]

    with pytest.raises(ApiClientError) as error:
        client.diagnostics()

    assert error.value.code == "forbidden"
    assert "raw server detail" not in str(error.value)
    assert "nwk_" not in str(error.value)


@pytest.mark.parametrize(("status", "code"), [(401, "unauthorized"), (404, "not_found"), (426, "incompatible"), (302, "unavailable")])
def test_client_classifies_http_failures_without_raw_details(status: int, code: str) -> None:
    client = WikiApiClient(ProviderConfig("http://127.0.0.1:3000/api/v1"), api_key="nwk_test_secret")
    client._opener = _TransportFixture(error_status=status)  # type: ignore[assignment]

    with pytest.raises(ApiClientError) as error:
        client.diagnostics()

    assert error.value.code == code
    assert "nwk_do_not_echo" not in str(error.value)
