from __future__ import annotations

import requests

from .base import BaseProvider, ProviderError


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(BaseProvider):
    provider_id = "anthropic"

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "x-api-key": api_key.strip(),
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "model": "claude-haiku-4-5",
            "max_tokens": 32,
            "system": "Return short plain text only.",
            "messages": [{"role": "user", "content": "Reply with OK"}],
        }
        response = requests.post(ANTHROPIC_API_URL, json=payload, headers=self._headers(api_key), timeout=20)
        if response.status_code >= 400:
            raise ProviderError(f"Anthropic validation failed: {response.text[:300]}")
        return {"ok": True}

    def generate_json(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        cache_key: str | None = None,
        cache_options: dict | None = None,
    ) -> dict:
        model_name = self._normalize_model_name(model)
        system_blocks = [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral", "ttl": (cache_options or {}).get("ttl", "1h")},
            }
        ]
        payload = {
            "model": model_name,
            "max_tokens": max_tokens,
            "cache_control": {"type": "ephemeral"},
            "system": system_blocks,
            "messages": [{"role": message["role"], "content": message["content"]} for message in messages],
        }
        response = requests.post(ANTHROPIC_API_URL, json=payload, headers=self._headers(api_key), timeout=60)
        if response.status_code >= 400:
            raise ProviderError(f"Anthropic request failed: {response.text[:500]}")
        data = response.json()
        try:
            text = "".join(block.get("text", "") for block in data["content"] if block.get("type") == "text").strip()
        except Exception as exc:
            raise ProviderError(f"Anthropic response parsing failed: {exc}") from exc
        return {"text": text, "usage": data.get("usage", {}), "raw": data}

    def _normalize_model_name(self, model: str) -> str:
        direct_map = {
            "claude-sonnet-3.7": "claude-3-7-sonnet-latest",
            "claude-haiku-3.5": "claude-3-5-haiku-latest",
            "claude-opus-3": "claude-3-opus-latest",
            "claude-haiku-3": "claude-3-haiku-20240307",
        }
        if model in direct_map:
            return direct_map[model]
        return model.replace(".7", "-7").replace(".6", "-6").replace(".5", "-5").replace(".1", "-1")
