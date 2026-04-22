from __future__ import annotations

import os
from typing import Optional, List, Dict, Any

import requests


OLLAMA_BASE_URL = os.getenv("CITYTASTE_OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("CITYTASTE_OLLAMA_MODEL", "gemma3:4b")

# Réglages performance
OLLAMA_TEMPERATURE = float(os.getenv("CITYTASTE_LLM_TEMPERATURE", "0.1"))
OLLAMA_MAX_TOKENS = int(os.getenv("CITYTASTE_LLM_MAX_TOKENS", "180"))
OLLAMA_TIMEOUT = int(os.getenv("CITYTASTE_OLLAMA_TIMEOUT", "180"))
OLLAMA_KEEP_ALIVE = os.getenv("CITYTASTE_OLLAMA_KEEP_ALIVE", "30m")
OLLAMA_NUM_CTX = int(os.getenv("CITYTASTE_OLLAMA_NUM_CTX", "2048"))


def build_messages(system: str, user: str) -> List[Dict[str, str]]:
    return [
        {"role": "system", "content": system or "Tu es un assistant utile."},
        {"role": "user", "content": user or ""},
    ]


class LLMService:
    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        model: str = OLLAMA_MODEL,
        temperature: float = OLLAMA_TEMPERATURE,
        max_tokens: int = OLLAMA_MAX_TOKENS,
        timeout: int = OLLAMA_TIMEOUT,
        keep_alive: str = OLLAMA_KEEP_ALIVE,
        num_ctx: int = OLLAMA_NUM_CTX,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.keep_alive = keep_alive
        self.num_ctx = num_ctx

    def is_available(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return resp.ok
        except Exception:
            return False

    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        final_temperature = self.temperature if temperature is None else temperature
        final_max_tokens = self.max_tokens if max_tokens is None else max_tokens

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": build_messages(
                system=system or "Tu es un assistant utile.",
                user=prompt,
            ),
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": final_temperature,
                "num_predict": final_max_tokens,
                "num_ctx": self.num_ctx,
            },
        }

        resp = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=self.timeout,
        )
        resp.raise_for_status()

        data = resp.json()
        message = data.get("message") or {}
        content = (message.get("content") or "").strip()
        return content

    def preload(self) -> bool:
        try:
            payload = {
                "model": self.model,
                "stream": False,
                "keep_alive": self.keep_alive,
                "messages": [],
                "options": {
                    "num_ctx": self.num_ctx,
                },
            }
            resp = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=30,
            )
            return resp.ok
        except Exception:
            return False


_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service