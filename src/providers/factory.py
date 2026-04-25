from .base import BaseProvider, ProviderError
from .anthropic_provider import AnthropicProvider
from .gemini_provider import GeminiProvider
from .openai_provider import OpenAIProvider


def get_provider(provider_id: str) -> BaseProvider:
    if provider_id == "openai":
        return OpenAIProvider()
    if provider_id == "gemini":
        return GeminiProvider()
    if provider_id == "anthropic":
        return AnthropicProvider()
    raise ProviderError(f"Unsupported provider: {provider_id}")
