from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FakeHermesContext:
    providers: list[object] = field(default_factory=list)

    def register_memory_provider(self, provider: object) -> None:
        self.providers.append(provider)


@dataclass
class FixtureResponse:
    status: int
    body: dict[str, Any]
    headers: dict[str, str] = field(default_factory=dict)


FixtureHandler = Callable[[str, str, dict[str, Any] | None], FixtureResponse]
