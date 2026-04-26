## Provider smoke tests

Small live-network checks for Symposium provider adapters.

Usage examples:

```powershell
python tests/provider_smoke/smoke_test_models.py --provider openai
python tests/provider_smoke/smoke_test_models.py --provider gemini
python tests/provider_smoke/smoke_test_models.py --provider anthropic
```

Notes:
- uses API keys from `.env`
- sends a very small JSON-generation prompt to each model
- skips OpenAI `o*` models on purpose
- intended as a live compatibility smoke test, not a unit test
