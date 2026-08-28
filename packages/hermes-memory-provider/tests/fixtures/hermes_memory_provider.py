"""Small Hermes contract stand-ins used without importing a live Hermes host."""

from __future__ import annotations


class MemoryProviderContext:
    def __init__(self) -> None:
        self.provider = None

    def register_memory_provider(self, provider: object) -> None:
        self.provider = provider
