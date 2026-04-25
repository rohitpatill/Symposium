from __future__ import annotations

import requests

import config
from .base import BaseProvider, ProviderError


class OpenAIProvider(BaseProvider):
    provider_id = "openai"

    def _headers(self, api_key: str) -> dict[str, str]:
        safe_api_key = api_key.replace("\u2011", "-").replace("\u2010", "-").replace("\u2212", "-")
        return {
            "Authorization": safe_api_key if safe_api_key.startswith("Bearer ") else f"Bearer {safe_api_key}",
            "Content-Type": "application/json",
        }

    def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "model": "gpt-4o-mini",
            "input": "Return a JSON object like {\"ok\": true}.",
            "max_output_tokens": 32,
            "text": {"format": {"type": "json_object"}},
        }
        response = requests.post(config.API_URL, json=payload, headers=self._headers(api_key), timeout=20)
        if response.status_code >= 400:
            raise ProviderError(f"OpenAI validation failed: {response.text[:300]}")
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
        input_items = [
            {"role": "user", "content": [{"type": "input_text", "text": system_prompt}]}
        ]
        for message in messages:
            if message["role"] == "assistant":
                input_items.append({"role": "assistant", "content": [{"type": "output_text", "text": message["content"]}]})
            else:
                input_items.append({"role": "user", "content": [{"type": "input_text", "text": message["content"]}]})
        payload = {
            "model": model,
            "input": input_items,
            "max_output_tokens": max_tokens,
            "text": {"format": {"type": "json_object"}},
        }
        if cache_key:
            payload["prompt_cache_key"] = cache_key
            payload["prompt_cache_retention"] = (cache_options or {}).get("retention", "in_memory")
        response = requests.post(config.API_URL, json=payload, headers=self._headers(api_key), timeout=60)
        if response.status_code >= 400:
            raise ProviderError(f"OpenAI request failed: {response.text[:500]}")
        data = response.json()
        try:
            text = data["output"][0]["content"][0]["text"]
        except Exception as exc:
            raise ProviderError(f"OpenAI response parsing failed: {exc}") from exc
        return {"text": text, "usage": data.get("usage", {}), "raw": data}
