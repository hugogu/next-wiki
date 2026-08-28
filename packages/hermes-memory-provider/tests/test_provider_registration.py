from __future__ import annotations

from importlib.metadata import entry_points

from next_wiki_memory import register


class _Context:
    def __init__(self) -> None:
        self.provider = None

    def register_memory_provider(self, provider) -> None:
        self.provider = provider


def test_wheel_exposes_the_next_wiki_memory_provider_entry_point() -> None:
    matches = [
        entry for entry in entry_points(group="hermes_agent.memory_providers")
        if entry.name == "next-wiki"
    ]
    assert len(matches) == 1
    assert matches[0].value == "next_wiki_memory:register"

    context = _Context()
    register(context)
    assert context.provider.name == "next-wiki"
