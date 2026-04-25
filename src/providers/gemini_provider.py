from __future__ import annotations

import requests

from .base import BaseProvider, ProviderError


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseProvider):
    provider_id = "gemini"

    def _url(self, model: str) -> str:
        return f"{GEMINI_BASE_URL}/{model}:generateContent"

    def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "contents": [{"parts": [{"text": "Return a JSON object like {\"ok\": true}."}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 32},
        }
        response = requests.post(
            self._url("gemini-2.5-flash"),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        if response.status_code >= 400:
            raise ProviderError(f"Gemini validation failed: {response.text[:300]}")
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
        contents = []
        for message in messages:
            role = "model" if message["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "maxOutputTokens": max_tokens,
            },
        }
        response = requests.post(
            self._url(model),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
        if response.status_code >= 400:
            raise ProviderError(f"Gemini request failed: {response.text[:500]}")
        data = response.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as exc:
            raise ProviderError(f"Gemini response parsing failed: {exc}") from exc
        usage = data.get("usageMetadata", {})
        return {"text": text, "usage": usage, "raw": data}
