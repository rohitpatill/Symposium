# Symposium Provider Architecture

This document describes how LLM providers are integrated into Symposium.

## Goal

Symposium supports multiple model providers without letting provider-specific code leak into orchestration logic.

Current providers:
- OpenAI
- Google Gemini
- Anthropic Claude

Design target:
- add more providers later by implementing one adapter file and registering it

## Structure

Provider code lives in `src/providers/`.

Files:
- `base.py` - common provider interface and provider error type
- `registry.py` - curated provider and model catalog used by the UI
- `factory.py` - returns the correct provider adapter
- `openai_provider.py` - OpenAI Responses API adapter
- `gemini_provider.py` - Gemini `generateContent` adapter
- `anthropic_provider.py` - Anthropic Messages API adapter

## Runtime contract

The rest of the app should not care about raw provider payload shapes.

Each provider implements:
- `validate_api_key(api_key)`
- `generate_json(api_key, model, system_prompt, messages, max_tokens, cache_key, cache_options)`

Returned shape is normalized to:
- `text`
- `usage`
- `raw`

## Agent integration

`src/agent.py` owns message history and prompt assembly, but no longer owns provider-specific HTTP logic.

Each agent now carries:
- `provider_type`
- `model_id`
- `api_key`

The provider adapter converts Symposium's internal message history into the provider's expected request format.

## Persistence model

Provider configs are stored in `llm_provider_configs`.

Managed-mode provider behavior:
- one saved key per provider type
- re-validating a provider updates the existing saved key instead of creating duplicates
- secrets are stored encrypted in `api_key_ciphertext`
- on Windows, encryption uses DPAPI so the raw key is not stored in plaintext
- legacy plaintext rows are migrated and scrubbed during startup

Team agents store:
- `provider_config_id`
- `model_id`

Conversation participants snapshot:
- `provider_type`
- `provider_config_id`
- `model_id`

This ensures old conversations remain reproducible even if team defaults change later.

Default mode remains environment-driven:
- if `OPENAI_API_KEY` is present, default mode uses OpenAI with `gpt-4o-mini`
- otherwise, if `GEMINI_API_KEY` is present, default mode uses Gemini with `gemini-3.1-flash-lite-preview`

## Prompt caching

OpenAI:
- prompt caching is automatic on supported models
- requests are sent with a stable `prompt_cache_key`
- request structure keeps stable prompt prefixes first so cache hits are more likely

Gemini:
- implicit caching is automatic on supported Gemini models
- requests keep stable prompt prefixes first to improve cache-hit chances
- explicit Gemini caching is not wired yet in this pass

Anthropic:
- uses automatic prompt caching via top-level `cache_control`
- also keeps `cache_control` on the system prompt block for a stable cacheable prefix
- system prompt is kept stable so repeated turns can benefit from cached context

## Adding a new provider

1. Add a model catalog entry in `src/providers/registry.py`
2. Implement a provider adapter in `src/providers/<provider>_provider.py`
3. Register it in `src/providers/factory.py`
4. Add provider validation handling in the provider management API if needed
5. Confirm the UI exposes the provider in the provider setup flow

If this boundary is respected, adding a new provider should not require changes in the orchestrator.
