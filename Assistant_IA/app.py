from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import os
import sys
import inspect
import sklearn

from services import assistant as assistant_module
from services.assistant import simple_citytaste_assistant, get_place_details_for_ui, detect_user_language

print("\n========== CITYTASTE DEBUG ==========")
print("APP FILE LOADED :", __file__)
print("CURRENT WORKING DIRECTORY :", os.getcwd())
print("PYTHON EXE :", sys.executable)
print("SKLEARN VERSION :", sklearn.__version__)
print("SKLEARN FILE :", sklearn.__file__)
print("ASSISTANT MODULE FILE :", assistant_module.__file__)
print("ASSISTANT FUNCTION MODULE :", simple_citytaste_assistant.__module__)
print("====================================\n")

app = FastAPI(title="CityTaste Assistant API")

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://vivanboy.github.io",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., description="Message de l'utilisateur")
    context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Contexte optionnel envoyé par l'interface CityTaste"
    )


def _safe_fallback_answer(message: str, context: Optional[Dict[str, Any]] = None) -> str:
    lang = detect_user_language(message or "", context=context)
    if lang == "en":
        return (
            "Sorry, I couldn't answer that properly right now. "
            "I can still help with CityTaste, such as finding restaurants or accommodations in Ottawa, "
            "understanding filters, and using the site."
        )
    return (
        "Désolé, je n’ai pas pu répondre correctement pour le moment. "
        "Je peux quand même t’aider avec CityTaste, par exemple pour trouver des restaurants ou des hébergements à Ottawa, "
        "comprendre les filtres et utiliser le site."
    )


def _call_assistant(message: str, context: Optional[Dict[str, Any]] = None):
    """
    Appelle l'assistant en restant compatible avec :
    - ancienne signature : simple_citytaste_assistant(message)
    - future signature   : simple_citytaste_assistant(message, context=...)
    """
    try:
        sig = inspect.signature(simple_citytaste_assistant)
        if "context" in sig.parameters:
            return simple_citytaste_assistant(message, context=context)
        return simple_citytaste_assistant(message)
    except TypeError:
        return simple_citytaste_assistant(message)


def _normalize_chat_response(result: Any, fallback_message: Optional[str] = None) -> Dict[str, Any]:
    fallback_message = fallback_message or "Désolé, je n’ai pas pu générer une réponse pour le moment."

    if result is None:
        return {"answer": fallback_message, "type": "fallback"}

    if isinstance(result, str):
        return {"answer": result}

    if isinstance(result, dict):
        if "answer" in result and isinstance(result["answer"], str):
            return result

        for key in ["message", "response", "reply", "text"]:
            if key in result and isinstance(result[key], str):
                normalized = dict(result)
                normalized["answer"] = result[key]
                return normalized

        return {
            "answer": fallback_message,
            "type": "fallback",
            "raw": result,
        }

    return {"answer": str(result)}


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "CityTaste Assistant API is running",
        "app_file": __file__,
        "cwd": os.getcwd(),
        "assistant_module_file": assistant_module.__file__,
        "python_executable": sys.executable,
        "sklearn_version": sklearn.__version__,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat")
def chat(req: ChatRequest):
    message = (req.message or "").strip()

    if not message:
        return {"answer": "Je n’ai pas reçu de question. Peux-tu écrire un message ?"}

    fallback_message = _safe_fallback_answer(message=message, context=req.context)

    try:
        result = _call_assistant(message=message, context=req.context)
        return _normalize_chat_response(result, fallback_message=fallback_message)
    except Exception as exc:
        print("\n===== CHAT API ERROR =====")
        print(type(exc).__name__, str(exc))
        print("==========================\n")
        return {"answer": fallback_message, "type": "fallback"}


@app.get("/api/place/{internal_id}")
def place_details(internal_id: int):
    place = get_place_details_for_ui(internal_id)
    if place is None:
        raise HTTPException(status_code=404, detail="Lieu introuvable.")
    return {"found": True, "place": place}