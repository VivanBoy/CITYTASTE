from pathlib import Path
import json
import re
import unicodedata

BASE_DIR = Path(__file__).resolve().parent.parent
HELP_PATH = BASE_DIR / "data" / "site_help.json"


def normalize_text(text):
    text = "" if text is None else str(text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_site_help():
    with open(HELP_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def answer_site_help(user_question):
    user_norm = normalize_text(user_question)
    user_tokens = set(user_norm.split())

    items = load_site_help()

    best_item = None
    best_score = -1

    for item in items:
        q_norm = normalize_text(item["question"])
        q_tokens = set(q_norm.split())

        overlap = len(user_tokens & q_tokens)

        if q_norm in user_norm:
            overlap += 2

        if overlap > best_score:
            best_score = overlap
            best_item = item

    if best_item is None or best_score <= 0:
        return "Je n’ai pas encore de réponse précise pour cette question sur le site."

    return best_item["answer"]