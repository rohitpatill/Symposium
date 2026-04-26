from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from src.providers import PROVIDER_CATALOG, get_provider


def provider_key(provider_id: str) -> str:
    if provider_id == "openai":
        return config.OPENAI_API_KEY
    if provider_id == "gemini":
        return config.GEMINI_API_KEY
    if provider_id == "anthropic":
        return config.ANTHROPIC_API_KEY
    return ""


def model_list(provider_id: str) -> list[dict]:
    models = list(PROVIDER_CATALOG[provider_id]["models"])
    if provider_id == "openai":
        models = [model for model in models if not model["model_id"].startswith("o")]
    return models


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["openai", "gemini", "anthropic"], required=True)
    args = parser.parse_args()

    api_key = provider_key(args.provider)
    if not api_key:
        print(f"Missing API key for {args.provider}.")
        return 1

    provider = get_provider(args.provider)
    failures = 0
    for model in model_list(args.provider):
        model_id = model["model_id"]
        try:
            result = provider.generate_json(
                api_key=api_key,
                model=model_id,
                system_prompt="Return JSON only.",
                messages=[{"role": "user", "content": 'Return {"ok": true, "model": "<your model name>"}'}],
                max_tokens=80,
                cache_key=f"symposium-smoke:{args.provider}:{model_id}",
                cache_options={"ttl": "5m"},
            )
            text = result["text"].strip()
            json.loads(text.removeprefix("```json").removeprefix("```").removesuffix("```").strip())
            print(f"PASS {model_id}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {model_id}: {exc}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
