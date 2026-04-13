from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from llama_cpp import Llama


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "Llama-3.2-1B-Instruct-Q4_K_M.gguf"

LLM_MODEL_PATH = Path(os.getenv("CITYTASTE_LLM_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
LLM_CTX_SIZE = int(os.getenv("CITYTASTE_LLM_CTX_SIZE", "4096"))
LLM_MAX_TOKENS = int(os.getenv("CITYTASTE_LLM_MAX_TOKENS", "512"))
LLM_TEMPERATURE = float(os.getenv("CITYTASTE_LLM_TEMPERATURE", "0.2"))
LLM_THREADS = int(os.getenv("CITYTASTE_LLM_THREADS", "6"))


def build_llama3_prompt(system: str, user: str) -> str:
    return (
        "<|start_header_id|>system<|end_header_id|>\n"
        f"{system}\n"
        "<|eot_id|>"
        "<|start_header_id|>user<|end_header_id|>\n"
        f"{user}\n"
        "<|eot_id|>"
        "<|start_header_id|>assistant<|end_header_id|>\n"
    )

class LLMService:
    def __init__(
        self,
        model_path: Path = LLM_MODEL_PATH,
        n_ctx: int = LLM_CTX_SIZE,
        max_tokens: int = LLM_MAX_TOKENS,
        temperature: float = LLM_TEMPERATURE,
        n_threads: int = LLM_THREADS,
    ):
        self.model_path = Path(model_path)
        self.n_ctx = n_ctx
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.n_threads = n_threads
        self._llm: Optional[Llama] = None

    def is_available(self) -> bool:
        return self.model_path.exists()

    def _load_model(self):
        if self._llm is None:
            if not self.model_path.exists():
                raise FileNotFoundError(
                    f"Modèle GGUF introuvable : {self.model_path}"
                )

            self._llm = Llama(
                model_path=str(self.model_path),
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                verbose=False,
            )

    def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        self._load_model()

        final_temperature = self.temperature if temperature is None else temperature
        final_max_tokens = self.max_tokens if max_tokens is None else max_tokens

        full_prompt = build_llama3_prompt(
            system=system or "Tu es un assistant utile.",
            user=prompt,
        )

        output = self._llm(
            full_prompt,
            max_tokens=final_max_tokens,
            temperature=final_temperature,
            stop=[
                "<|eot_id|>",
                "<|end_of_text|>",
                "<|start_header_id|>",
            ],
        )

        text = output["choices"][0]["text"].strip()
        return text


_llm_service = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service