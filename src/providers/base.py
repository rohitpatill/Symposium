from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProviderError(Exception):
    pass


class BaseProvider(ABC):
    provider_id: str

    @abstractmethod
    def validate_api_key(self, api_key: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def generate_json(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        cache_key: str | None = None,
        cache_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError
