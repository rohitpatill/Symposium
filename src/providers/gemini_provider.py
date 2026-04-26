from __future__ import annotations

import json
import requests

from .base import BaseProvider, ProviderError


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseProvider):
    provider_id = "gemini"

    def _url(self, model: str) -> str:
        return f"{GEMINI_BASE_URL}/{model}:generateContent"

    def _normalize_model(self, model: str) -> str:
        if model == "gemini-2.5-flash-lite-preview-09-2025":
            return "gemini-2.5-flash-lite"
        return model

    def _request(self, api_key: str, model: str, payload: dict) -> dict:
        response = requests.post(
            self._url(model),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=120,
        )
        if response.status_code >= 400:
            raise ProviderError(f"Gemini request failed: {response.text[:500]}")
        return response.json()

    def _extract_text(self, data: dict) -> str:
        return "".join(
            part.get("text", "")
            for candidate in data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
            if part.get("text")
        ).strip()

    def _looks_like_complete_json(self, text: str) -> bool:
        if not text:
            return False
        try:
            json.loads(text.removeprefix("```json").removeprefix("```").removesuffix("```").strip())
            return True
        except json.JSONDecodeError:
            return False

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
        model_name = self._normalize_model(model)
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
        data = self._request(api_key, model_name, payload)
        text = self._extract_text(data)
        finish_reason = (data.get("candidates") or [{}])[0].get("finishReason")
        if finish_reason == "MAX_TOKENS" and not self._looks_like_complete_json(text):
            retry_payload = {
                **payload,
                "generationConfig": {
                    **payload["generationConfig"],
                    "maxOutputTokens": max(max_tokens, 256),
                },
            }
            data = self._request(api_key, model_name, retry_payload)
            text = self._extract_text(data)
        if not text:
            raise ProviderError("Gemini response parsing failed: no text parts returned")
        usage = data.get("usageMetadata", {})
        return {"text": text, "usage": usage, "raw": data}
