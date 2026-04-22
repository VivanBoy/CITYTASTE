from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from services.place_service import search_places, get_place_details
from services.site_rag_service import answer_site_with_rag
from services.llm_service import get_llm_service
from services.query_parser_service import parse_user_query
from services.prompts import (
    SYSTEM_PROMPT,
    format_place_results,
    build_search_results_prompt,
    build_site_answer_rewrite_prompt,
    build_ood_prompt,
)


ENGLISH_HINTS = {
    "the", "a", "an", "and", "or", "but", "with", "for", "from", "to", "of",
    "in", "on", "near", "best", "good", "restaurant", "hotel", "food", "hungry",
    "where", "what", "which", "how", "can", "could", "do", "does", "is", "are",
    "open", "closed", "rating", "price", "cheap", "expensive", "show", "find",
    "recommend", "recommended", "recommendation", "looking", "help", "filter", "filters", "search",
    "results", "location", "position", "book", "booking", "reserve", "details",
    "works", "use", "dataset", "thanks", "hello", "hi", "bye", "today", "okay",
    "why", "appears", "shown", "order", "sorted", "ranking", "ranked", "center", "downtown"
}

FRENCH_HINTS = {
    "le", "la", "les", "un", "une", "des", "et", "ou", "mais", "avec", "pour",
    "de", "du", "dans", "sur", "pres", "près", "meilleur", "bon", "restaurant", "hotel",
    "hôtel", "nourriture", "ou", "où", "quoi", "quel", "quelle", "comment", "peux", "peut",
    "est", "sont", "ouvert", "ferme", "fermé", "note", "prix", "pas", "cher", "montre",
    "trouve", "recommande", "recommandation", "cherche", "aide", "filtre", "filtres",
    "recherche", "resultats", "résultats", "localisation", "position", "reservation",
    "réservation", "reserver", "réserver", "details", "détails", "fonctionne", "utiliser",
    "dataset", "donnees", "données", "merci", "bonjour", "salut", "faim", "accord",
    "pourquoi", "apparait", "apparaît", "affiche", "classement", "centre", "centreville", "centre-ville"
}

GREETINGS = ["bonjour", "salut", "hello", "hi", "bonsoir", "coucou", "hey"]
THANKS_WORDS = ["merci", "thanks", "thank", "thx"]
GOODBYE_WORDS = ["bye", "goodbye", "au revoir", "bonne journee", "bonne journée", "a bientot", "à bientôt"]
HOW_ARE_YOU_PHRASES = ["ca va", "ça va", "how are you", "how r you", "tu vas bien"]
HUNGER_PHRASES = ["j ai faim", "j'ai faim", "i am hungry", "i'm hungry", "hungry", "starving"]
IDENTITY_PHRASES = [
    "qui es tu", "que peux tu faire", "comment peux tu m aider", "what can you do",
    "who are you", "how can you help me", "what do you do"
]
ACK_WORDS = {
    "ok", "okay", "ok merci", "merci", "daccord", "d accord", "je comprends", "je comprend",
    "i understand", "got it", "sounds good", "alright", "all right", "compris"
}
YES_WORDS = {"oui", "yes", "oui oui", "yes please", "ouais", "yep", "yeah"}
DATASET_WORDS = ["dataset", "data", "donnees", "données", "base de donnees", "base de données"]
OUT_OF_SCOPE_WORDS = [
    "math", "maths", "mathematique", "mathématique", "devoir", "devoirs", "homework",
    "assignment", "equation", "équation", "algebra", "algèbre", "calculus", "derivee", "dérivée",
    "cv", "resume", "president", "politique", "physics", "chimie", "chemistry"
]
OTHER_CITY_WORDS = [
    "montreal", "toronto", "vancouver", "quebec", "gatineau", "new york", "paris", "london"
]
ROAD_HINTS = [
    " rd", " road", " avenue", " ave", " street", " st", " boulevard", " blvd", " drive", " dr",
    " lane", " ln", " way", " court", " ct", " rue", " chemin"
]

SITE_DETAIL_FIELD_KEYWORDS = {
    "address": ["address", "adresse", "where is", "ou est", "où est", "location"],
    "hours": ["hours", "opening hours", "open", "closed", "horaire", "horaires", "ouvert", "ouverte", "ferme", "fermé"],
    "website": ["website", "site", "site web", "web"],
    "rating": ["rating", "note", "reviews", "avis", "stars", "etoiles", "étoiles"],
    "photo": ["photo", "image", "picture"],
    "accessibility": ["wheelchair", "accessible", "accessibility", "accessibilite", "accessibilité"],
    "cuisine": ["cuisine", "food type", "type de cuisine"],
    "type": ["type", "category", "categorie", "catégorie"],
}

SELECTED_PLACE_KEYS = [
    "selected_place", "selectedPlace", "current_place", "currentPlace", "active_place", "activePlace",
    "place", "place_details", "placeDetails", "selected_result", "selectedResult", "current_result",
    "currentResult", "active_result", "activeResult", "result", "card", "selected_card", "selectedCard"
]

FILTER_CONTEXT_KEYS = [
    "filters", "active_filters", "activeFilters", "selected_filters", "selectedFilters",
    "search_filters", "searchFilters", "preferences", "criteria"
]

BROAD_CUISINE_MAP = {
    "asian": ["chinese", "japanese", "thai", "vietnamese", "indian"],
}

AREA_HINTS = [
    "zone", "quartier", "secteur", "area", "district", "neighborhood", "neighbourhood",
    "centre", "center", "downtown", "byward", "st laurent", "saint laurent"
]


def normalize_text(text: str) -> str:
    text = "" if text is None else str(text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> List[str]:
    return normalize_text(text).split()


def contains_phrase(text: str, phrase: str) -> bool:
    return normalize_text(phrase) in normalize_text(text)


def contains_any_token(text: str, words: List[str]) -> bool:
    tokens = set(tokenize(text))
    normalized_words = {normalize_text(w) for w in words}
    return any(w in tokens for w in normalized_words)


def make_response(response_type: str, message: str, **extra: Any) -> Dict[str, Any]:
    payload = {"type": response_type, "message": message, "answer": message}
    payload.update(extra)
    return payload


def clean_final_answer(text: str) -> str:
    if not text:
        return ""

    cleaned = text.strip()

    # Supprime les balises <final>...</final> sans supprimer le contenu
    cleaned = re.sub(r"</?\s*final\s*>", "", cleaned, flags=re.IGNORECASE).strip()

    # Supprime le markdown gras global
    cleaned = cleaned.replace("**", "")

    prefix_patterns = [
        r"^voici la reponse finale\s*:\s*",
        r"^voici la réponse finale\s*:\s*",
        r"^reponse finale\s*:\s*",
        r"^réponse finale\s*:\s*",
        r"^voici la reponse\s*:\s*",
        r"^voici la réponse\s*:\s*",
        r"^here is the final answer\s*:\s*",
        r"^final answer\s*:\s*",
        r"^search without result\s*:\s*",
        r"^recherche sans resultat\s*:\s*",
        r"^recherche sans résultat\s*:\s*",
        r"^consigne finale\s*:\s*",
        r"^une courte phrase d introduction\s*:\s*",
        r"^question utilisateur\s*:\s*",
        r"^filtres resolus\s*:\s*",
        r"^filtres résolus\s*:\s*",
        r"^resultats autorises\s*:\s*",
        r"^résultats autorisés\s*:\s*",
    ]
    for pattern in prefix_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

    banned_starts = [
        "voici la réponse finale",
        "voici la reponse finale",
        "réponse finale",
        "reponse finale",
        "voici la réponse",
        "voici la reponse",
        "je comprends que l'utilisateur",
        "je comprends que l utilisateur",
        "je vais essayer de vous aider",
        "je vais utiliser",
        "je vais chercher",
        "j'ai cherché",
        "j ai cherche",
        "après avoir analysé",
        "apres avoir analyse",
        "puisque je n'ai trouvé",
        "puisque je n ai trouve",
        "pour expliquer",
        "recherche sans résultat",
        "recherche sans resultat",
        "consigne finale",
        "une courte phrase d'introduction",
        "une courte phrase d introduction",
        "here is the final answer",
        "i understand that the user",
        "i will search",
        "i will use",
        "i searched",
    ]

    kept_lines = []
    for line in cleaned.splitlines():
        line_clean = line.strip()
        if not line_clean:
            continue

        line_clean = re.sub(r"</?\s*final\s*>", "", line_clean, flags=re.IGNORECASE).strip()
        line_clean = line_clean.replace("**", "")
        line_clean = re.sub(r"^\*\s+", "- ", line_clean)
        if not line_clean:
            continue

        normalized = normalize_text(line_clean)
        if any(normalized.startswith(normalize_text(prefix)) for prefix in banned_starts):
            continue

        kept_lines.append(line_clean)

    cleaned = "\n".join(kept_lines).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    return cleaned or ""


def _strip_role_prefix(value: str) -> str:
    value = (value or "").strip()
    value = re.sub(r"^(user|assistant|system)\s*:\s*", "", value, flags=re.IGNORECASE)
    return value.strip()


def get_history_messages(context: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(context, dict):
        return []

    collected: List[str] = []

    for key in ["history", "messages", "conversation", "chat_history"]:
        value = context.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    collected.append(_strip_role_prefix(item.strip()))
                elif isinstance(item, dict):
                    role = str(item.get("role", "")).lower()
                    content = item.get("content") or item.get("message") or item.get("text")
                    if isinstance(content, str) and content.strip():
                        prefix = f"{role}: " if role else ""
                        collected.append(_strip_role_prefix(prefix + content.strip()))

    for key in ["last_user_message", "previous_user_message", "last_message"]:
        value = context.get(key)
        if isinstance(value, str) and value.strip():
            collected.append(_strip_role_prefix(value.strip()))

    return collected[-12:]


def _score_language(text: str) -> Tuple[int, int]:
    t = (text or "").strip().lower()
    if not t:
        return 0, 0

    if re.search(r"[àâçéèêëîïôùûüÿœæ]", t):
        return 0, 4

    words = re.findall(r"\b[\w']+\b", t)
    en_score = sum(1 for w in words if w in ENGLISH_HINTS)
    fr_score = sum(1 for w in words if w in FRENCH_HINTS)

    if re.search(r"\b(hello|hi|hey|thanks|thank you|how are you|i am|i'm|can you|find me|show me|how do i|how can i|okay|why)\b", t):
        en_score += 4

    if re.search(r"\b(bonjour|salut|merci|comment|peux tu|j ai|j'ai|trouve moi|montre moi|comment activer|comment utiliser|d accord|daccord|pourquoi)\b", t):
        fr_score += 4

    return en_score, fr_score


def detect_user_language(text: str, context: Optional[Dict[str, Any]] = None) -> str:
    en_score, fr_score = _score_language(text)
    if en_score > fr_score:
        return "en"
    if fr_score > en_score:
        return "fr"

    history = get_history_messages(context)
    hist_en = 0
    hist_fr = 0
    for item in history[-6:]:
        e, f = _score_language(item)
        hist_en += e
        hist_fr += f

    if hist_en > hist_fr:
        return "en"
    if hist_fr > hist_en:
        return "fr"
    return "fr"


def language_instruction(lang: str) -> str:
    return "Reply in English." if lang == "en" else "Réponds en français."


def get_ui_text(lang: str) -> Dict[str, str]:
    if lang == "en":
        return {
            "empty": "I didn't receive a question. Could you send your message again?",
            "greeting": "Hello! I can help you with CityTaste.",
            "how_are_you": "I'm doing well, thanks! If you're hungry or planning a stay, I can help with CityTaste.",
            "hungry": "I can help you find something to eat in Ottawa. Tell me a cuisine, an area, or a budget.",
            "thanks": "You're welcome!",
            "ack": "Got it. Let me know what you'd like to find on CityTaste.",
            "goodbye": "You're welcome. Have a great day!",
            "capabilities": "I’m the CityTaste assistant. I can help you find restaurants or accommodations in Ottawa, explain the filters, the results, rankings, and how the site works.",
            "out_of_scope": "Sorry, I’m mainly here to help with CityTaste — finding restaurants or accommodations in Ottawa, using filters, understanding results, rankings, recommendations, and navigating the site.",
            "ottawa_only": "CityTaste is currently focused on Ottawa. I can help you look for a similar place in Ottawa instead.",
            "site_unknown": "I couldn't find a clear enough answer in the CityTaste help content for that question.",
            "dataset": "CityTaste uses a dataset focused on places in Ottawa, especially restaurants and some accommodations. Depending on the place, the data can include the name, type, cuisine, address, location, hours, website, photo, and rating when available.",
            "places_none": "I couldn't find a matching place right now in the available CityTaste data.",
            "places_try_again": "Try a broader request, for example a cuisine, a budget, or a nearby area in Ottawa.",
            "keyword_prefix": "near",
            "unknown_name": "Unnamed place",
            "address_unavailable": "address unavailable",
            "site_help_default": "I can help explain how CityTaste works, including filters, location, recommendations, result cards, and booking links when available.",
            "recommendation_general": "A place can be recommended because it matches useful criteria such as the place type, cuisine, distance indicator, rating, or the amount of available details.",
            "place_context_missing": "I can explain a specific place better when the selected result is available in the interface context.",
            "field_unavailable": "This information is not available for this place in the current data.",
            "page_context": "I can only know the current page or selected result if the interface sends that context to me.",
        }
    return {
        "empty": "Je n’ai pas reçu de question. Peux-tu renvoyer ton message ?",
        "greeting": "Bonjour ! Je peux t’aider avec CityTaste.",
        "how_are_you": "Je vais bien, merci ! Si tu as faim ou si tu cherches un hébergement, je peux t’aider avec CityTaste.",
        "hungry": "Je peux t’aider à trouver quelque chose à manger à Ottawa. Dis-moi une cuisine, une zone ou un budget.",
        "thanks": "Avec plaisir !",
        "ack": "D’accord. Dis-moi ce que tu veux trouver sur CityTaste.",
        "goodbye": "Avec plaisir. Bonne journée !",
        "capabilities": "Je suis l’assistant de CityTaste. Je peux t’aider à trouver des restaurants ou des hébergements à Ottawa, expliquer les filtres, les résultats, les classements et le fonctionnement du site.",
        "out_of_scope": "Je suis désolé, je suis surtout là pour t’aider avec CityTaste : trouver des restaurants ou des hébergements à Ottawa, utiliser les filtres, comprendre les résultats, les classements, les recommandations et naviguer sur le site.",
        "ottawa_only": "CityTaste est actuellement centré sur Ottawa. Je peux quand même t’aider à chercher une option similaire à Ottawa.",
        "site_unknown": "Je n’ai pas trouvé de réponse assez claire dans l’aide de CityTaste pour cette question.",
        "dataset": "CityTaste utilise un dataset centré sur des lieux à Ottawa, surtout des restaurants et quelques hébergements. Selon le lieu, on peut y trouver le nom, le type, la cuisine, l’adresse, la position, les horaires, le site web, la photo et la note quand ces informations sont disponibles.",
        "places_none": "Je n’ai pas trouvé de lieu correspondant pour le moment dans les données disponibles de CityTaste.",
        "places_try_again": "Essaie avec une demande un peu plus large, par exemple une cuisine, un budget ou une zone proche à Ottawa.",
        "keyword_prefix": "près de",
        "unknown_name": "Lieu sans nom",
        "address_unavailable": "adresse non disponible",
        "site_help_default": "Je peux t’expliquer comment fonctionne CityTaste, y compris les filtres, la position, les recommandations, les fiches résultats et les liens de réservation quand ils sont disponibles.",
        "recommendation_general": "Un lieu peut être recommandé parce qu’il correspond à des critères utiles comme le type de lieu, la cuisine, la distance indicative, la note, ou la richesse des informations disponibles.",
        "place_context_missing": "Je peux mieux expliquer un lieu précis quand le résultat sélectionné est disponible dans le contexte de l’interface.",
        "field_unavailable": "Cette information n’est pas disponible pour ce lieu dans les données actuelles.",
        "page_context": "Je ne peux connaître la page actuelle ou le résultat sélectionné que si l’interface m’envoie ce contexte.",
    }


def get_site_topic_fallback(topic: Optional[str], lang: str) -> str:
    ui = get_ui_text(lang)
    if topic and topic in ui:
        return ui[topic]
    return ui["site_unknown"]


def is_greeting_only(text: str) -> bool:
    tokens = tokenize(text)
    return bool(tokens) and len(tokens) <= 5 and contains_any_token(text, GREETINGS)


def is_thanks_only(text: str) -> bool:
    tokens = tokenize(text)
    return bool(tokens) and len(tokens) <= 6 and contains_any_token(text, THANKS_WORDS)


def is_goodbye(text: str) -> bool:
    normalized = normalize_text(text)
    return normalized in {normalize_text(x) for x in GOODBYE_WORDS} or normalized in {
        "bonne journee", "bonne soiree", "have a nice day", "have a good day"
    }


def is_how_are_you(text: str) -> bool:
    return any(contains_phrase(text, p) for p in HOW_ARE_YOU_PHRASES)


def is_hungry_message(text: str) -> bool:
    return any(contains_phrase(text, p) for p in HUNGER_PHRASES)


def is_acknowledgement(text: str) -> bool:
    t = normalize_text(text)
    return t in {normalize_text(x) for x in ACK_WORDS}


def is_simple_yes(text: str) -> bool:
    return normalize_text(text) in {normalize_text(x) for x in YES_WORDS}


def is_identity_or_capabilities_question(text: str) -> bool:
    q = normalize_text(text)
    return any(contains_phrase(q, p) for p in IDENTITY_PHRASES) or q in {"help", "aide", "what can you do", "que fais tu"}


def is_dataset_question(text: str) -> bool:
    return contains_any_token(text, DATASET_WORDS)


def is_out_of_scope_request(text: str) -> bool:
    return contains_any_token(text, OUT_OF_SCOPE_WORDS)


def is_page_context_question(text: str) -> bool:
    q = normalize_text(text)
    phrases = [
        "tu peux voir la page", "tu vois la page", "quelle page je suis", "page sur laquelle je suis",
        "can you see the page", "do you see the page", "what page am i on", "current page"
    ]
    return any(contains_phrase(q, p) for p in phrases)


def is_place_address_followup(text: str) -> bool:
    q = normalize_text(text)
    phrases = [
        "il est ou", "ou est il", "où est il",
        "c est ou", "c est ou", "c'est où",
        "where is it", "where is this place",
        "what is the address", "what's the address",
        "quelle est l adresse", "quelle est l'adresse",
        "son adresse", "adresse"
    ]
    return any(contains_phrase(q, p) for p in phrases)


def detect_place_type(text: str) -> Optional[str]:
    if contains_any_token(text, ["restaurant", "resto", "manger", "repas", "food", "eat", "restaurants", "restos"]):
        return "restaurant"
    if contains_any_token(text, ["hotel", "hôtel", "hebergement", "hébergement", "hostel", "motel", "logement", "auberge", "accommodation", "stay", "hebergements", "hébergements"]):
        return "hotel"
    return None


def detect_cuisine(text: str) -> Optional[str]:
    cuisine_map = {
        "asian": ["asian", "asiatique", "asia"],
        "italian": ["italian", "italien", "italienne"],
        "indian": ["indian", "indien", "indienne"],
        "chinese": ["chinese", "chinois", "chinoise"],
        "pizza": ["pizza", "pizzeria"],
        "vietnamese": ["vietnamese", "vietnamien", "vietnamienne"],
        "african": ["african", "africain", "africaine"],
        "ethiopian": ["ethiopian", "ethiopien", "ethiopienne"],
        "lebanese": ["lebanese", "libanais", "libanaise"],
        "french": ["french", "francais", "francaise", "français", "française"],
        "japanese": ["japanese", "japonais", "japonaise", "sushi"],
        "thai": ["thai", "thailandais", "thailandaise", "thaï", "thaïlandais", "thaïlandaise"],
        "mexican": ["mexican", "mexicain", "mexicaine"],
    }
    tokens = set(tokenize(text))
    for canonical, variants in cuisine_map.items():
        normalized_variants = {normalize_text(v) for v in variants}
        if any(v in tokens for v in normalized_variants):
            return canonical
    return None


def detect_max_distance_km(text: str) -> Optional[float]:
    text_n = normalize_text(text)
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*km", text_n)
    if match:
        return float(match.group(1).replace(",", "."))
    if any(contains_phrase(text_n, p) for p in ["proche", "pres", "près", "near", "nearby", "close to", "autour de moi", "around me"]):
        return 5.0
    return None


def detect_min_rating(text: str) -> Optional[float]:
    for phrase in [
        "bonne note", "bien note", "bien notee", "tres bien note", "tres bonne note",
        "top rated", "good rating", "well rated", "highly rated", "bonne evaluation", "bonne évaluation"
    ]:
        if contains_phrase(text, phrase):
            return 4.0
    return None


def has_search_intent(text: str) -> bool:
    search_tokens = [
        "cherche", "chercher", "trouve", "trouver", "montre", "montrer", "recommande", "recommander",
        "suggere", "suggerer", "liste", "donne", "propose", "near", "nearby", "find", "show",
        "recommend", "list", "looking", "veux", "want", "need"
    ]
    search_phrases = [
        "pres de moi", "près de moi", "autour de moi", "montre moi", "donne moi", "trouve moi",
        "recommande moi", "near me", "around me", "show me", "find me", "recommend me", "looking for",
        "je veux trouver", "je veux trouve", "i want to find", "i need a"
    ]
    return contains_any_token(text, search_tokens) or any(contains_phrase(text, p) for p in search_phrases)


def is_place_explanation_question(text: str) -> bool:
    q = normalize_text(text)
    phrases = [
        "why is this place recommended",
        "why this place",
        "why is this result recommended",
        "why does this result appear",
        "why does this place appear",
        "why is it recommended",
        "why recommended",
        "why was this shown",
        "why is this shown",
        "pourquoi ce lieu est recommande",
        "pourquoi ce lieu apparait",
        "pourquoi ce resultat apparait",
        "pourquoi ce resultat est recommande",
        "pourquoi ce lieu est propose",
        "pourquoi ce lieu m est propose",
        "pourquoi ce resultat m est propose",
        "pourquoi cette recommandation",
    ]
    if any(contains_phrase(q, p) for p in phrases):
        return True

    tokens = set(tokenize(q))
    why_tokens = {"why", "pourquoi"}
    explanation_tokens = {
        "recommend", "recommended", "recommendation", "recommande", "recommandation",
        "result", "results", "resultat", "resultats", "shown", "show", "appear", "appears",
        "apparait", "affiche", "propose", "suggested"
    }
    return bool(tokens & why_tokens) and bool(tokens & explanation_tokens)


def has_explicit_selected_place_reference(text: str) -> bool:
    q = normalize_text(text)
    phrases = [
        "ce lieu", "cet endroit", "ce restaurant", "cet hebergement", "cet hébergement",
        "ce resultat", "ce résultat", "cette fiche", "ce lieu ci", "this place", "this result",
        "this restaurant", "this hotel", "this accommodation", "selected place", "selected result",
        "parle moi de ce lieu", "details de ce lieu", "details de ce resultat", "details de cette fiche"
    ]
    return any(contains_phrase(q, p) for p in phrases)


def detect_selected_place_detail_fields(text: str) -> List[str]:
    q = normalize_text(text)
    fields: List[str] = []

    general_phrases = [
        "show details", "more details", "see details", "tell me more", "open details",
        "voir les details", "plus de details", "montre les details", "ouvrir la fiche",
        "donne moi les details", "parle moi de ce lieu", "parle moi de cet endroit",
        "details de ce lieu", "details de ce resultat", "details de cette fiche"
    ]
    if any(contains_phrase(q, p) for p in general_phrases):
        return ["general"]

    for field, keywords in SITE_DETAIL_FIELD_KEYWORDS.items():
        if any(contains_phrase(q, kw) for kw in keywords) or contains_any_token(q, keywords):
            fields.append(field)

    return fields


def extract_place_name_from_detail_query(text: str) -> Optional[str]:
    q = normalize_text(text)
    patterns = [
        r"(?:adresse de|l adresse de|adresse du|details de|details du|detail de|detail du)\s+([a-z0-9\s&\-']+)$",
        r"(?:address of|details of|where is)\s+([a-z0-9\s&\-']+)$",
    ]
    generic = {
        "ce lieu", "cet endroit", "ce restaurant", "ce resultat", "cette fiche",
        "this place", "this result", "this restaurant", "this hotel", "selected place"
    }

    for pattern in patterns:
        match = re.search(pattern, q, flags=re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            if candidate and candidate not in generic:
                return candidate

    return None


def is_sorting_query(text: str) -> bool:
    q = normalize_text(text)
    sorting_phrases = [
        "comment les resultats sont classes", "comment les resultats sont classés",
        "classement des resultats", "classement des résultats",
        "order of results", "how are results ranked", "how are results sorted",
        "sorting of results", "sort order"
    ]
    if any(contains_phrase(q, p) for p in sorting_phrases):
        return True
    return contains_any_token(q, ["classement", "classements", "classer", "classes", "classés", "sorting", "sorted", "ranked", "ranking", "order"])


def has_site_signal(text: str) -> bool:
    site_tokens = [
        "site", "page", "interface", "filtre", "filtres", "filter", "filters", "recherche", "search",
        "distance", "image", "images", "photo", "photos", "detail", "details", "fiche", "resultat",
        "resultats", "result", "results", "fonctionne", "utiliser", "works", "use",
        "localisation", "location", "position", "geolocalisation", "geolocation", "reservation", "reserver",
        "book", "booking", "reserve", "tri", "sort", "recommandation", "recommande", "recommended",
        "recommendation", "shown", "appear", "appears", "affiche", "apparait",
        "classement", "classements", "ranking", "ranked", "sorted", "order"
    ]
    site_phrases = [
        "comment utiliser", "how to use", "how does it work", "comment ca marche", "comment fonctionne",
        "activer ma position", "activer ma localisation", "enable my location", "turn on location",
        "how do i enable my location", "comment activer ma position", "comment activer ma localisation",
        "comment utiliser les filtres", "how do i use filters", "why is this place recommended",
        "why does this result appear", "why is this shown", "pourquoi ce lieu est recommande",
        "pourquoi ce resultat apparait", "comment fonctionne la recommandation", "how does recommendation work",
        "comment les resultats sont classes", "classement des resultats"
    ]
    return contains_any_token(text, site_tokens) or any(contains_phrase(text, p) for p in site_phrases)


def mentions_other_city(text: str) -> bool:
    q = normalize_text(text)
    for city in OTHER_CITY_WORDS:
        city_n = normalize_text(city)
        if city_n in q:
            idx = q.find(city_n)
            around = q[max(0, idx - 15): idx + len(city_n) + 15]
            if any(hint.strip() in around for hint in [h.strip() for h in ROAD_HINTS]):
                continue
            return True
    return False


def _cleanup_area_keyword(value: str) -> Optional[str]:
    value = normalize_text(value)
    if not value:
        return None

    if value in {"ma localisation", "ma position", "my location", "my position", "ici", "here"}:
        return None

    value = re.split(r"\b(?:avec|with|ayant|having|qui|that|dont|and|et)\b", value, maxsplit=1)[0].strip()
    value = re.sub(r"\b(?:dans|la|le|les|du|de|des|zone|quartier|secteur|the|area|district|neighborhood|neighbourhood)\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip()

    if value in {"ma localisation", "ma position", "my location", "my position", ""}:
        return None
    return value or None


def extract_address_or_area_keyword(text: str, context: Optional[Dict[str, Any]] = None) -> Optional[str]:
    normalized = normalize_text(text)

    area_patterns = [
        r"(?:dans\s+la\s+zone\s+de|dans\s+la\s+zone\s+du|dans\s+le\s+quartier\s+de|dans\s+le\s+quartier\s+du|dans\s+le\s+secteur\s+de|dans\s+le\s+secteur\s+du|in\s+the\s+area\s+of|in\s+the\s+zone\s+of|in\s+the\s+district\s+of|in\s+the\s+neighborhood\s+of|in\s+the\s+neighbourhood\s+of)\s+([a-z0-9\-\s'.#]+)",
        r"(?:pres\s+de|proche\s+de|near|close\s+to|around)\s+([a-z0-9\-\s'.#]+)",
    ]
    for pattern in area_patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if match:
            value = _cleanup_area_keyword(match.group(1))
            if value:
                return value

    road_patterns = [
        r"\b(\d{1,5}\s+[a-z0-9\-\s'.]+\b(?:road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|rue|chemin))\b",
        r"\b([a-z][a-z0-9\-\s'.]+\b(?:road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|rue|chemin))\b",
    ]
    for pattern in road_patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if match:
            value = _cleanup_area_keyword(match.group(1))
            if value:
                return value

    if "byward" in normalized:
        return "byward"
    if "st laurent" in normalized or "saint laurent" in normalized:
        return "st laurent"
    if "centre ottawa" in normalized or "center ottawa" in normalized or "centre ville" in normalized or "centreville" in normalized or "downtown ottawa" in normalized:
        return "centre ottawa"

    tokens = tokenize(normalized)
    if 1 <= len(tokens) <= 4 and any(h in normalized for h in AREA_HINTS):
        value = _cleanup_area_keyword(normalized)
        if value:
            return value

    if isinstance(context, dict):
        for key in ["address", "user_address", "location_label", "area", "neighborhood", "neighbourhood", "zone"]:
            value = context.get(key)
            if isinstance(value, str) and value.strip():
                cleaned = _cleanup_area_keyword(value.strip())
                if cleaned:
                    return cleaned

    return None


def infer_site_topic(text: str) -> Optional[str]:
    q = normalize_text(text)
    if is_place_explanation_question(q):
        return "recommendation"
    if is_sorting_query(q):
        return "sorting"
    if contains_any_token(q, ["filtre", "filtres", "filter", "filters"]):
        return "filters"
    if contains_any_token(q, ["position", "localisation", "location", "geolocalisation", "geolocation", "distance"]):
        return "location"
    if contains_any_token(q, ["reservation", "reservations", "reserver", "book", "booking", "reserve"]):
        return "booking"
    if contains_any_token(q, ["recommandation", "recommande", "recommended", "recommendation", "recommend", "propose", "shown", "appear", "apparait", "affiche"]):
        return "recommendation"
    if contains_any_token(q, ["detail", "details", "fiche", "resultat", "resultats", "result", "results", "photo", "image"]):
        return "results"
    if contains_any_token(q, ["utiliser", "fonctionne", "use", "works"]):
        return "usage"
    return None


def _coerce_internal_id(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _looks_like_place_payload(value: Any) -> bool:
    return isinstance(value, dict) and any(
        key in value for key in [
            "internal_id", "name", "place_type", "address", "google_rating",
            "opening_hours", "website", "google_photo_url", "cuisine", "wheelchair"
        ]
    )


def _hydrate_place_candidate(value: Any) -> Optional[Dict[str, Any]]:
    if value is None:
        return None

    internal_id = _coerce_internal_id(value)
    if internal_id is not None:
        try:
            return get_place_details(internal_id)
        except Exception:
            return None

    if isinstance(value, dict):
        if "internal_id" in value:
            internal_id = _coerce_internal_id(value.get("internal_id"))
            if internal_id is not None:
                try:
                    db_place = get_place_details(internal_id) or {}
                except Exception:
                    db_place = {}
                merged = dict(db_place)
                merged.update(value)
                return merged if _looks_like_place_payload(merged) else None
        if _looks_like_place_payload(value):
            return value

    return None


def extract_selected_place(context: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(context, dict):
        return None

    for key in SELECTED_PLACE_KEYS:
        place = _hydrate_place_candidate(context.get(key))
        if place:
            return place

    if _looks_like_place_payload(context):
        return context

    for value in context.values():
        if isinstance(value, dict):
            place = _hydrate_place_candidate(value)
            if place:
                return place
            for key in SELECTED_PLACE_KEYS:
                nested_place = _hydrate_place_candidate(value.get(key))
                if nested_place:
                    return nested_place

    return None


def extract_active_filters(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(context, dict):
        return {}

    raw: Dict[str, Any] = {}
    for key in FILTER_CONTEXT_KEYS:
        value = context.get(key)
        if isinstance(value, dict):
            raw.update(value)

    if not raw:
        raw = context

    filters: Dict[str, Any] = {}

    def first_value(keys: List[str]) -> Any:
        for key in keys:
            value = raw.get(key)
            if value not in (None, "", []):
                return value
        return None

    filters["place_type"] = first_value(["place_type", "type"])
    filters["cuisine"] = first_value(["cuisine"])
    filters["keyword"] = first_value(["keyword", "area", "neighborhood", "neighbourhood", "zone", "location_label"])

    max_distance = first_value(["max_distance_km", "maxKm", "distance_km", "distance", "max_distance"])
    if max_distance not in (None, ""):
        try:
            filters["max_distance_km"] = float(max_distance)
        except Exception:
            pass

    min_rating = first_value(["min_rating", "rating", "minRating"])
    if min_rating not in (None, ""):
        try:
            filters["min_rating"] = float(min_rating)
        except Exception:
            pass

    return {k: v for k, v in filters.items() if v not in (None, "")}


def llm_is_available() -> bool:
    try:
        return get_llm_service().is_available()
    except Exception:
        return False


def _llm_generate(prompt: str, system: str, temperature: float = 0.25, max_tokens: int = 220) -> str:
    llm = get_llm_service()
    raw = llm.generate(
        prompt=prompt,
        system=system,
        temperature=temperature,
        max_tokens=max_tokens,
    ).strip()

    cleaned = clean_final_answer(raw)
    return cleaned or raw


def get_strict_site_faq_answer(user_message: str, lang: str) -> Optional[str]:
    q = normalize_text(user_message)

    optional_location_phrases = [
        "suis je oblige d activer ma position",
        "suis je oblige d activer ma localisation",
        "est ce que je dois activer ma position",
        "est ce que je dois activer ma localisation",
        "do i need to enable my location",
        "do i have to enable my location",
        "is location required",
        "is my location required",
    ]
    if any(p in q for p in optional_location_phrases):
        if lang == "en":
            return (
                "No. Enabling your location is optional in CityTaste. "
                "If you allow it, the site can better interpret proximity requests such as nearby or close to me. "
                "Without your location, CityTaste can still work, but the displayed distance may rely on a general reference point instead of your real position."
            )
        return (
            "Non. Activer ta position n’est pas obligatoire dans CityTaste. "
            "Si tu l’autorises, le site peut mieux interpréter des demandes comme proche de moi. "
            "Sans ta position, CityTaste peut quand même fonctionner, mais la distance affichée peut reposer sur un point de référence général plutôt que sur ta position réelle."
        )

    enable_location_phrases = [
        "comment activer ma position",
        "comment activer ma localisation",
        "how do i enable my location",
        "how can i enable my location",
        "how to enable my location",
    ]
    if any(p in q for p in enable_location_phrases):
        if lang == "en":
            return (
                "To enable your location, use the location option shown by the interface if it is available. "
                "Your browser should then ask for permission. If you allow it, CityTaste can better interpret nearby requests. "
                "If you refuse, the site can still work with a more general distance reference."
            )
        return (
            "Pour activer ta position, utilise l’option de localisation affichée par l’interface si elle est disponible. "
            "Ton navigateur devrait alors demander l’autorisation. Si tu acceptes, CityTaste pourra mieux interpréter les demandes de proximité. "
            "Si tu refuses, le site peut quand même fonctionner avec une référence de distance plus générale."
        )

    place_details_phrases = [
        "comment voir les details d un lieu",
        "comment voir les details dun lieu",
        "comment voir les details d un endroit",
        "how do i see the details of a place",
        "how can i view place details",
        "how do i open place details",
    ]
    if any(p in q for p in place_details_phrases):
        if lang == "en":
            return (
                "To see more details about a place, open its result card or the detailed view associated with that result when it is available. "
                "Depending on the place, CityTaste may show information such as the address, opening hours, website, rating, and photo."
            )
        return (
            "Pour voir plus de détails sur un lieu, ouvre sa carte résultat ou la fiche détaillée associée à ce résultat quand elle est disponible. "
            "Selon le lieu, CityTaste peut afficher des informations comme l’adresse, les horaires, le site web, la note et la photo."
        )

    no_image_phrases = [
        "pourquoi certains lieux n ont pas d images",
        "pourquoi certains lieux n ont pas d image",
        "why do some places not have images",
        "why do some places not have photos",
        "why do some places have no image",
    ]
    if any(p in q for p in no_image_phrases):
        if lang == "en":
            return (
                "Some places do not have images because visual data is not always available or reliable for every result. "
                "CityTaste prefers showing only information it can associate with enough confidence instead of filling missing fields artificially."
            )
        return (
            "Certains lieux n’ont pas d’image parce que les données visuelles ne sont pas toujours disponibles ou suffisamment fiables pour chaque résultat. "
            "CityTaste préfère montrer uniquement ce qu’il peut associer avec assez de confiance plutôt que de remplir artificiellement les champs manquants."
        )

    return None


def generate_natural_message(intent: str, user_message: str, lang: str, fallback: str, context: Optional[Dict[str, Any]] = None) -> str:
    if not llm_is_available():
        return fallback

    history = "\n".join(get_history_messages(context)[-6:])

    intent_guidance = {
        "greeting": "Respond with a short, warm greeting as the CityTaste assistant. Mention CityTaste naturally in one sentence.",
        "thanks": "Reply briefly and warmly to the user's thanks. Do not restart a long explanation.",
        "ack": "Reply briefly to the acknowledgement. Keep it natural and invite the user to continue if appropriate.",
        "goodbye": "Reply briefly and warmly to end the conversation.",
        "how_are_you": "Answer naturally that you are doing well, then gently steer back to CityTaste in one short sentence.",
        "hungry": "React naturally to the fact that the user is hungry, then offer help finding food in Ottawa through CityTaste.",
        "capabilities": "Explain briefly what CityTaste can help with: restaurants, accommodations, filters, results, rankings, recommendations, and site usage in Ottawa.",
        "dataset": "Answer briefly about the CityTaste dataset. Stay at a high level and do not invent unsupported specifics.",
        "out_of_scope": "Politely explain that you mainly help with CityTaste. Do not answer the out-of-scope request itself.",
        "ottawa_only": "Explain politely that CityTaste is focused on Ottawa and offer help for Ottawa instead.",
        "page_context_query": "Explain that you only know the current page or selected result if the interface sends that context to you.",
    }

    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + language_instruction(lang)
        + "\nYou are the CityTaste assistant."
        + "\nBe warm, natural, and concise."
        + "\nDo not invent facts or features."
        + "\nStay within CityTaste's scope."
    )

    prompt = f"""
{language_instruction(lang)}

Intent:
{intent}

Guidance:
{intent_guidance.get(intent, 'Reply naturally and briefly.')}

Fallback message:
{fallback}

Recent conversation:
{history or '- No recent history'}

Latest user message:
{user_message}

Write one short natural reply.
""".strip()

    try:
        text = _llm_generate(prompt=prompt, system=system, temperature=0.35, max_tokens=120)
        return text or fallback
    except Exception:
        return fallback


def rephrase_site_answer(
    user_message: str,
    verified_answer: str,
    lang: str,
    context: Optional[Dict[str, Any]] = None,
    topic: Optional[str] = None,
) -> str:
    verified_answer = (verified_answer or "").strip()
    if not verified_answer:
        return get_site_topic_fallback(topic, lang)

    if not llm_is_available():
        fallback = get_site_topic_fallback(topic, lang)
        return fallback or verified_answer

    history = "\n".join(get_history_messages(context)[-6:])
    prompt = build_site_answer_rewrite_prompt(
        user_message=user_message,
        language=lang,
        raw_site_answer=verified_answer,
    )
    prompt = f"{prompt}\n\nRecent conversation:\n{history or '- No recent history'}"

    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + language_instruction(lang)
        + "\nUse only the verified answer provided."
        + "\nDo not invent buttons, pages, unsupported UI flows, or features."
        + "\nKeep the same meaning."
        + "\nIf the target language is English, write only in English."
        + "\nIf the target language is French, write only in French."
        + "\nDo not mix French and English."
    )

    try:
        text = _llm_generate(prompt=prompt, system=system, temperature=0.05, max_tokens=180)
        return text or verified_answer
    except Exception:
        fallback = get_site_topic_fallback(topic, lang)
        return fallback or verified_answer


def format_places_for_ui(places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for p in places:
        formatted.append(
            {
                "internal_id": p.get("internal_id"),
                "name": p.get("name"),
                "place_type": p.get("place_type"),
                "cuisine": p.get("cuisine"),
                "address": p.get("address"),
                "dist_to_center_km": p.get("dist_to_center_km"),
                "distance_km": p.get("dist_to_center_km"),
                "google_rating": p.get("google_rating"),
                "google_user_rating_count": p.get("google_user_rating_count"),
                "website": p.get("website"),
                "opening_hours": p.get("opening_hours"),
                "google_photo_url": p.get("google_photo_url"),
                "wheelchair": p.get("wheelchair"),
                "text": p.get("text"),
            }
        )
    return formatted


def _sort_places_for_output(places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def key_fn(p: Dict[str, Any]) -> Tuple[int, float, int, float]:
        rating = p.get("google_rating")
        dist = p.get("dist_to_center_km")
        return (
            0 if rating is not None else 1,
            -(float(rating) if rating is not None else 0.0),
            0 if dist is not None else 1,
            float(dist) if dist is not None else 9999.0,
        )

    return sorted(places, key=key_fn)


def _extract_search_constraints(user_message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parsed = parse_user_query(user_message)

    place_type = parsed.get("place_type") or detect_place_type(user_message)
    cuisine = parsed.get("cuisine") or detect_cuisine(user_message)
    max_distance_km = detect_max_distance_km(user_message)
    min_rating = detect_min_rating(user_message)

    zone_value = parsed.get("zone")
    keyword = None
    if isinstance(zone_value, str) and zone_value.strip():
        keyword = zone_value.replace("_", " ")
    if not keyword:
        keyword = extract_address_or_area_keyword(user_message, context=context)

    return {
        "place_type": place_type,
        "cuisine": cuisine,
        "max_distance_km": max_distance_km,
        "min_rating": min_rating,
        "keyword": keyword,
        "_parser": parsed,
    }


def detect_missing_search_field(constraints: Dict[str, Any]) -> Optional[str]:
    place_type = constraints.get("place_type")
    cuisine = constraints.get("cuisine")
    keyword = constraints.get("keyword")

    if (place_type or cuisine) and not keyword:
        return "keyword"

    return None


def get_pending_search(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(context, dict):
        return {}

    pending = context.get("pending_search")
    if isinstance(pending, dict):
        return dict(pending)

    return {}


def infer_recent_site_topic(context: Optional[Dict[str, Any]]) -> Optional[str]:
    history = get_history_messages(context)
    for item in reversed(history[-8:]):
        topic = infer_site_topic(item)
        if topic:
            return topic
    return None


def infer_recent_places_constraints(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    history = get_history_messages(context)
    for item in reversed(history[-8:]):
        cleaned = _strip_role_prefix(item)
        constraints = _extract_search_constraints(cleaned, context=None)
        parsed = constraints.get("_parser") or {}
        if parsed.get("intent") == "place_search" or has_search_intent(cleaned) or constraints.get("place_type") or constraints.get("cuisine") or constraints.get("keyword"):
            return {k: v for k, v in constraints.items() if v is not None and k != "_parser"}
    return {}


def _strip_leading_confirmation(text: str) -> str:
    cleaned = normalize_text(text)
    cleaned = re.sub(r"^(oui|yes|ok|okay|d accord|daccord|ouais)\b", "", cleaned).strip()
    return cleaned


def is_short_search_followup(text: str, context: Optional[Dict[str, Any]]) -> bool:
    cleaned = _strip_leading_confirmation(text)
    if not cleaned:
        return False
    tokens = cleaned.split()
    if len(tokens) > 4:
        return False
    if has_search_intent(cleaned) or has_site_signal(cleaned):
        return False
    if is_acknowledgement(cleaned) or is_simple_yes(cleaned):
        return False
    recent = infer_recent_places_constraints(context)
    return bool(recent)


def is_search_like_message(text: str) -> bool:
    parsed = parse_user_query(text)
    if parsed.get("intent") == "place_search":
        return True
    if parsed.get("cuisine") or parsed.get("zone") or parsed.get("place_type"):
        return True
    return has_search_intent(text) or any(
        x in normalize_text(text) for x in ["zone", "quartier", "secteur", "area", "center", "centre", "downtown", "byward", "st laurent"]
    )


def merge_followup_places_constraints(user_message: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    recent = infer_recent_places_constraints(context)
    current = _extract_search_constraints(user_message, context=context)
    cleaned_followup = _strip_leading_confirmation(user_message)

    merged = dict(recent)
    for key, value in current.items():
        if key == "_parser":
            continue
        if value is not None:
            merged[key] = value

    if merged.get("keyword") is None and cleaned_followup:
        if 1 <= len(cleaned_followup.split()) <= 4:
            maybe_keyword = _cleanup_area_keyword(cleaned_followup)
            if maybe_keyword:
                merged["keyword"] = maybe_keyword

    return merged


def merge_pending_search_with_user_reply(user_message: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    pending = get_pending_search(context)
    current = _extract_search_constraints(user_message, context=context)

    merged = dict(pending)

    for key in ["place_type", "cuisine", "max_distance_km", "min_rating", "keyword"]:
        value = current.get(key)
        if value is not None:
            merged[key] = value

    if not merged.get("keyword"):
        maybe_keyword = extract_address_or_area_keyword(user_message, context=context)
        if maybe_keyword:
            merged["keyword"] = maybe_keyword

    return merged


def build_search_follow_up_message(lang: str, missing_field: str, constraints: Dict[str, Any]) -> str:
    if missing_field == "keyword":
        if lang == "en":
            return "Which area of Ottawa do you want to search in?"
        return "Dans quelle zone d’Ottawa veux-tu chercher ?"

    if lang == "en":
        return "Could you clarify your search?"
    return "Peux-tu préciser ta recherche ?"


def search_place_by_name(place_name: str) -> Optional[Dict[str, Any]]:
    if not place_name:
        return None

    try:
        rows = search_places(keyword=place_name, limit=5)
    except Exception:
        return None

    if not rows:
        return None

    target = normalize_text(place_name)

    for row in rows:
        row_name = normalize_text(row.get("name"))
        if row_name == target:
            return row

    for row in rows:
        row_name = normalize_text(row.get("name"))
        if target in row_name or row_name in target:
            return row

    return rows[0]


def route_intent(user_message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    selected_place = extract_selected_place(context)
    search_constraints = _extract_search_constraints(user_message, context=context)
    parsed = search_constraints.get("_parser") or {}

    if is_thanks_only(user_message):
        return {"intent": "thanks", "lang_needs_llm": True}

    if is_simple_yes(user_message):
        recent_topic = infer_recent_site_topic(context)
        if recent_topic:
            return {"intent": "site_query", "topic": recent_topic}

    if is_acknowledgement(user_message):
        return {"intent": "ack", "lang_needs_llm": True}
    if is_goodbye(user_message):
        return {"intent": "goodbye", "lang_needs_llm": True}
    if is_how_are_you(user_message):
        return {"intent": "how_are_you", "lang_needs_llm": True}
    if is_hungry_message(user_message):
        return {"intent": "hungry", "lang_needs_llm": True}
    if is_greeting_only(user_message):
        return {"intent": "greeting", "lang_needs_llm": True}
    if is_identity_or_capabilities_question(user_message):
        return {"intent": "capabilities", "lang_needs_llm": True}
    if is_dataset_question(user_message):
        return {"intent": "dataset", "lang_needs_llm": True}
    if is_page_context_question(user_message):
        return {"intent": "page_context_query"}

    if is_place_explanation_question(user_message):
        if selected_place:
            return {"intent": "place_explanation", "topic": "recommendation"}
        return {"intent": "site_query", "topic": "recommendation"}

    detail_fields = detect_selected_place_detail_fields(user_message)
    explicit_name = extract_place_name_from_detail_query(user_message)

    if selected_place and is_place_address_followup(user_message):
        return {"intent": "place_detail_query", "fields": ["address"]}

    if selected_place and detail_fields and has_explicit_selected_place_reference(user_message):
        return {"intent": "place_detail_query", "fields": detail_fields}

    if explicit_name and detail_fields:
        return {"intent": "named_place_detail_query", "fields": detail_fields, "place_name": explicit_name}

    pending_search = get_pending_search(context)
    if pending_search:
        merged_pending = merge_pending_search_with_user_reply(user_message, context)
        if any(merged_pending.get(k) is not None for k in ["place_type", "cuisine", "keyword"]):
            return {
                "intent": "places_query",
                "place_type": merged_pending.get("place_type"),
                "cuisine": merged_pending.get("cuisine"),
                "max_distance_km": merged_pending.get("max_distance_km"),
                "min_rating": merged_pending.get("min_rating"),
                "keyword": merged_pending.get("keyword"),
                "parsed": parsed,
                "from_pending_follow_up": True,
            }

    if is_search_like_message(user_message) or parsed.get("intent") == "place_search":
        merged = dict(search_constraints)
        if is_short_search_followup(user_message, context):
            merged = merge_followup_places_constraints(user_message, context)
        return {
            "intent": "places_query",
            "place_type": merged.get("place_type"),
            "cuisine": merged.get("cuisine"),
            "max_distance_km": merged.get("max_distance_km"),
            "min_rating": merged.get("min_rating"),
            "keyword": merged.get("keyword"),
            "parsed": parsed,
        }

    if is_out_of_scope_request(user_message) and not is_search_like_message(user_message) and not has_site_signal(user_message):
        return {"intent": "out_of_scope", "lang_needs_llm": True}
    if mentions_other_city(user_message) and not has_site_signal(user_message):
        return {"intent": "ottawa_only", "lang_needs_llm": True}

    if has_site_signal(user_message):
        return {"intent": "site_query", "topic": infer_site_topic(user_message)}

    if is_short_search_followup(user_message, context):
        merged = merge_followup_places_constraints(user_message, context)
        return {
            "intent": "places_query",
            "place_type": merged.get("place_type"),
            "cuisine": merged.get("cuisine"),
            "max_distance_km": merged.get("max_distance_km"),
            "min_rating": merged.get("min_rating"),
            "keyword": merged.get("keyword"),
            "parsed": parsed,
        }

    return {"intent": "out_of_scope", "lang_needs_llm": True}


def search_places_with_constraints(
    place_type: Optional[str],
    cuisine: Optional[str],
    max_distance_km: Optional[float],
    min_rating: Optional[float],
    keyword: Optional[str],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    if cuisine in BROAD_CUISINE_MAP:
        seen = set()
        aggregated: List[Dict[str, Any]] = []

        for sub_cuisine in BROAD_CUISINE_MAP[cuisine]:
            rows = search_places(
                place_type=place_type,
                cuisine=sub_cuisine,
                max_distance_km=max_distance_km,
                min_rating=min_rating,
                keyword=keyword,
                limit=limit,
            )
            for row in rows:
                internal_id = row.get("internal_id")
                if internal_id not in seen:
                    seen.add(internal_id)
                    aggregated.append(row)

        return _sort_places_for_output(aggregated)[:limit]

    return search_places(
        place_type=place_type,
        cuisine=cuisine,
        max_distance_km=max_distance_km,
        min_rating=min_rating,
        keyword=keyword,
        limit=limit,
    )


def fallback_places_message(places: List[Dict[str, Any]], lang: str) -> str:
    ui = get_ui_text(lang)
    if not places:
        return f"{ui['places_none']} {ui['places_try_again']}"

    lines: List[str] = []
    for i, p in enumerate(places[:3], start=1):
        name = p.get("name") or ui["unknown_name"]
        cuisine = p.get("cuisine") or ""
        address = p.get("address") or ui["address_unavailable"]
        rating = p.get("google_rating")
        parts = [name]
        if cuisine:
            parts.append(str(cuisine))
        if rating is not None:
            parts.append(f"{rating}/5")
        parts.append(address)
        lines.append(f"{i}. " + " — ".join(parts))
    intro = "Here are a few options:" if lang == "en" else "Voici quelques options :"
    return intro + "\n" + "\n".join(lines)


def build_no_results_message(lang: str, filters: Optional[Dict[str, Any]] = None) -> str:
    filters = filters or {}

    place_type = filters.get("place_type")
    cuisine = filters.get("cuisine")
    zone = filters.get("zone") or filters.get("keyword")

    if lang == "en":
        parts = []
        if place_type == "restaurant":
            parts.append("restaurant")
        elif place_type in {"hotel", "accommodation"}:
            parts.append("accommodation")
        else:
            parts.append("place")

        if cuisine:
            parts.append(f"with {cuisine} cuisine")
        if zone:
            parts.append(f"near {str(zone).replace('_', ' ')}")

        target = " ".join(parts).strip()
        return (
            f"I couldn't find an exact match for this {target} in the current CityTaste data. "
            f"You can try broadening the area or removing one filter."
        )

    parts = []
    if place_type == "restaurant":
        parts.append("restaurant")
    elif place_type in {"hotel", "accommodation"}:
        parts.append("hébergement")
    else:
        parts.append("lieu")

    if cuisine:
        parts.append(f"de cuisine {cuisine}")
    if zone:
        parts.append(f"près de {str(zone).replace('_', ' ')}")

    target = " ".join(parts).strip()
    return (
        f"Je n’ai pas trouvé de correspondance exacte pour ce {target} dans les données actuelles de CityTaste. "
        f"Tu peux essayer d’élargir la zone ou de retirer un filtre."
    )


def summarize_places_answer(
    user_message: str,
    places: List[Dict[str, Any]],
    lang: str,
    parsed_filters: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> str:
    parsed_filters = parsed_filters or {}
    fallback = fallback_places_message(places, lang)

    if not places:
        return build_no_results_message(lang=lang, filters=parsed_filters)

    if not llm_is_available():
        return fallback

    history = "\n".join(get_history_messages(context)[-6:])
    prompt = build_search_results_prompt(user_message, parsed_filters, places)
    prompt = f"{prompt}\n\nRecent conversation:\n{history or '- No recent history'}"

    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + language_instruction(lang)
        + "\nUse only the provided place information."
        + "\nDo not invent places, ratings, distances, neighborhoods, or addresses."
        + "\nDo not explain your internal process."
        + "\nDo not say: 'voici la réponse finale', 'j'ai cherché', 'je vais chercher', 'consigne finale', or similar meta phrases."
        + "\nGive only the final user-facing answer."
        + "\nIf the target language is English, write only in English."
        + "\nIf the target language is French, write only in French."
    )

    try:
        text = _llm_generate(prompt=prompt, system=system, temperature=0.12, max_tokens=220)
        return text or fallback
    except Exception:
        return fallback


def build_recommendation_fallback(place: Optional[Dict[str, Any]], filters: Dict[str, Any], lang: str) -> str:
    ui = get_ui_text(lang)
    if not place:
        return f"{ui['recommendation_general']} {ui['place_context_missing']}"

    name = place.get("name") or ui["unknown_name"]
    reasons: List[str] = []

    place_type = (place.get("place_type") or "").strip()
    cuisine = (place.get("cuisine") or "").strip()
    rating = place.get("google_rating")
    distance_km = place.get("distance_km")
    if distance_km is None:
        distance_km = place.get("dist_to_center_km")
    website = place.get("website")
    hours = place.get("opening_hours")
    photo = place.get("google_photo_url")
    wheelchair = place.get("wheelchair")

    wanted_type = filters.get("place_type")
    if wanted_type and place_type and normalize_text(place_type) == normalize_text(str(wanted_type)):
        reasons.append("it matches the requested place type" if lang == "en" else "il correspond au type de lieu demandé")
    elif place_type:
        reasons.append(f"it is a {place_type}" if lang == "en" else f"c’est un {place_type}")

    wanted_cuisine = filters.get("cuisine")
    if wanted_cuisine and cuisine:
        if wanted_cuisine == "asian":
            asian_members = set(BROAD_CUISINE_MAP["asian"])
            if any(member in normalize_text(cuisine) for member in asian_members):
                reasons.append("it matches the requested Asian cuisine family" if lang == "en" else "il correspond à la famille de cuisines asiatiques recherchée")
        elif normalize_text(str(wanted_cuisine)) in normalize_text(cuisine):
            reasons.append("it matches the requested cuisine" if lang == "en" else "il correspond à la cuisine recherchée")
    elif cuisine:
        reasons.append(f"its cuisine is listed as {cuisine}" if lang == "en" else f"sa cuisine indiquée est {cuisine}")

    min_rating = filters.get("min_rating")
    if rating is not None:
        if min_rating is not None:
            try:
                if float(rating) >= float(min_rating):
                    reasons.append(
                        f"its rating ({rating}/5) meets the rating filter" if lang == "en" else f"sa note ({rating}/5) respecte le filtre de note"
                    )
            except Exception:
                pass
        else:
            reasons.append(f"it has a rating of {rating}/5" if lang == "en" else f"il a une note de {rating}/5")

    max_distance = filters.get("max_distance_km")
    if distance_km is not None:
        if max_distance is not None:
            try:
                if float(distance_km) <= float(max_distance):
                    reasons.append(
                        f"its distance indicator fits within the selected distance filter ({distance_km} km)" if lang == "en" else f"sa distance indicative entre dans le filtre de distance sélectionné ({distance_km} km)"
                    )
            except Exception:
                pass
        else:
            reasons.append(
                f"it has a distance indicator of about {distance_km} km from the app reference point" if lang == "en" else f"il a une distance indicative d’environ {distance_km} km depuis le point de référence utilisé par l’application"
            )

    if website or hours or photo or wheelchair:
        reasons.append(
            "it has useful details available in the card or detailed view" if lang == "en" else "il dispose d’informations utiles dans la carte ou la fiche détaillée"
        )

    if not reasons:
        reasons.append(ui["recommendation_general"])

    if lang == "en":
        return f"{name} may be recommended because " + "; ".join(reasons[:4]) + ". Recommendations remain a helpful suggestion, not a real-time guarantee."
    return f"{name} peut être recommandé parce que " + " ; ".join(reasons[:4]) + ". La recommandation reste une aide utile, pas une garantie en temps réel."


def explain_selected_place(user_message: str, place: Optional[Dict[str, Any]], lang: str, context: Optional[Dict[str, Any]] = None) -> str:
    filters = extract_active_filters(context)
    fallback = build_recommendation_fallback(place, filters, lang)
    if not place:
        return fallback
    if not llm_is_available():
        return fallback

    history = "\n".join(get_history_messages(context)[-6:])
    place_context = format_place_results([place])
    filters_block = "\n".join(f"- {k}: {v}" for k, v in filters.items()) if filters else "- No active filters provided"
    if lang == "fr" and not filters:
        filters_block = "- Aucun filtre actif fourni"

    system = (
        SYSTEM_PROMPT
        + "\n\n"
        + language_instruction(lang)
        + "\nYou explain why a selected place may appear in CityTaste."
        + "\nUse only the provided place data and active filters."
        + "\nDo not invent hidden ranking rules, real-time availability, or personalized distance."
        + "\nIf the target language is English, write only in English."
        + "\nIf the target language is French, write only in French."
    )
    prompt = f"""
{language_instruction(lang)}

Recent conversation:
{history or '- No recent history'}

User question:
{user_message}

Selected place data:
{place_context}

Active filters from the interface:
{filters_block}

Write a short explanation of why this place may be recommended or shown. Base it only on the available data and stay cautious.
""".strip()

    try:
        text = _llm_generate(prompt=prompt, system=system, temperature=0.2, max_tokens=190)
        return text or fallback
    except Exception:
        return fallback


def answer_selected_place_details(user_message: str, place: Optional[Dict[str, Any]], lang: str, context: Optional[Dict[str, Any]] = None) -> str:
    ui = get_ui_text(lang)
    if not place:
        return ui["place_context_missing"]

    name = place.get("name") or ui["unknown_name"]
    fields = detect_selected_place_detail_fields(user_message)
    if not fields:
        fields = ["general"]

    messages: List[str] = []

    def add_message(value: Any, en_label: str, fr_label: str, suffix: str = "") -> None:
        if value in (None, ""):
            messages.append(ui["field_unavailable"])
            return
        label = en_label if lang == "en" else fr_label
        messages.append(f"{label} {value}{suffix}".strip())

    if "general" in fields:
        general_parts: List[str] = [name]
        if place.get("place_type"):
            general_parts.append(str(place.get("place_type")))
        if place.get("cuisine"):
            general_parts.append(str(place.get("cuisine")))
        if place.get("address"):
            general_parts.append(str(place.get("address")))
        if place.get("google_rating") is not None:
            general_parts.append(f"{place.get('google_rating')}/5")
        if lang == "en":
            messages.append("Here are the main details I have: " + " — ".join(general_parts))
        else:
            messages.append("Voici les principales informations que j’ai : " + " — ".join(general_parts))

    if "address" in fields:
        add_message(place.get("address"), "Address:", "Adresse :")

    if "hours" in fields:
        hours = place.get("opening_hours")
        if hours in (None, ""):
            messages.append(ui["field_unavailable"])
        else:
            if lang == "en":
                messages.append(f"Recorded opening hours: {hours}. I still can't confirm live opening in real time.")
            else:
                messages.append(f"Horaires enregistrés : {hours}. Je ne peux quand même pas confirmer l’ouverture en temps réel.")

    if "website" in fields:
        add_message(place.get("website"), "Website:", "Site web :")

    if "rating" in fields:
        rating = place.get("google_rating")
        rating_count = place.get("google_user_rating_count")
        if rating is None:
            messages.append(ui["field_unavailable"])
        else:
            if rating_count not in (None, ""):
                messages.append(
                    f"Rating: {rating}/5 ({rating_count} reviews)." if lang == "en" else f"Note : {rating}/5 ({rating_count} avis)."
                )
            else:
                messages.append(f"Rating: {rating}/5." if lang == "en" else f"Note : {rating}/5.")

    if "photo" in fields:
        if place.get("google_photo_url"):
            messages.append(
                "A photo is available for this place in the current data." if lang == "en" else "Une photo est disponible pour ce lieu dans les données actuelles."
            )
        else:
            messages.append(ui["field_unavailable"])

    if "accessibility" in fields:
        wheelchair = place.get("wheelchair")
        if wheelchair in (None, ""):
            messages.append(ui["field_unavailable"])
        else:
            messages.append(
                f"Accessibility info: {wheelchair}." if lang == "en" else f"Information d’accessibilité : {wheelchair}."
            )

    if "cuisine" in fields:
        add_message(place.get("cuisine"), "Cuisine:", "Cuisine :")

    if "type" in fields:
        add_message(place.get("place_type"), "Type:", "Type :")

    unique_messages: List[str] = []
    for msg in messages:
        if msg and msg not in unique_messages:
            unique_messages.append(msg)

    return " ".join(unique_messages).strip()


def enrich_site_query_for_rag(user_message: str, topic: Optional[str]) -> str:
    if topic == "recommendation":
        return (
            f"{user_message} why is this place recommended why does this result appear "
            f"recommendation recommended shown explanation pourquoi ce lieu est recommande "
            f"pourquoi ce resultat apparait recommandation"
        )
    if topic == "sorting":
        return (
            f"{user_message} how are results ranked how are results sorted sort order ranking "
            f"classement des resultats classement tri pertinence distance note"
        )
    return user_message


def simple_citytaste_assistant(user_message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_message = (user_message or "").strip()
    lang = detect_user_language(user_message, context=context)
    ui = get_ui_text(lang)

    if not user_message:
        return make_response("empty", ui["empty"], sources=[])

    route = route_intent(user_message, context=context)

    print("\n===== ASSISTANT DEBUG =====")
    print("USER MESSAGE:", user_message)
    print("LANG:", lang)
    print("ROUTE:", route)
    print("LLM AVAILABLE:", llm_is_available())
    print("===========================\n")

    intent = route["intent"]

    if intent in {"greeting", "thanks", "ack", "goodbye", "how_are_you", "hungry", "capabilities", "dataset", "out_of_scope", "ottawa_only"}:
        fallback_map = {
            "greeting": ui["greeting"],
            "thanks": ui["thanks"],
            "ack": ui["ack"],
            "goodbye": ui["goodbye"],
            "how_are_you": ui["how_are_you"],
            "hungry": ui["hungry"],
            "capabilities": ui["capabilities"],
            "dataset": ui["dataset"],
            "out_of_scope": ui["out_of_scope"],
            "ottawa_only": ui["ottawa_only"],
        }

        if intent == "out_of_scope" and llm_is_available():
            try:
                prompt = build_ood_prompt(user_message=user_message, language=lang)
                system = SYSTEM_PROMPT + "\n\n" + language_instruction(lang)
                text = _llm_generate(prompt=prompt, system=system, temperature=0.2, max_tokens=120)
                return make_response(intent, text or fallback_map[intent], sources=[])
            except Exception:
                pass

        message = generate_natural_message(intent, user_message, lang, fallback_map[intent], context=context)
        return make_response(intent, message, sources=[])

    if intent == "page_context_query":
        message = generate_natural_message(intent, user_message, lang, ui["page_context"], context=context)
        return make_response("site_help", message, sources=[])

    if intent == "place_explanation":
        selected_place = extract_selected_place(context)
        message = explain_selected_place(user_message, selected_place, lang, context=context)
        return make_response(
            "place_explanation",
            message,
            place=format_places_for_ui([selected_place])[0] if selected_place else None,
            active_filters=extract_active_filters(context),
        )

    if intent == "place_detail_query":
        selected_place = extract_selected_place(context)
        message = answer_selected_place_details(user_message, selected_place, lang, context=context)
        return make_response(
            "place_details",
            message,
            place=format_places_for_ui([selected_place])[0] if selected_place else None,
        )

    if intent == "named_place_detail_query":
        place_name = route.get("place_name")
        raw_place = search_place_by_name(place_name) if isinstance(place_name, str) else None
        place = format_places_for_ui([raw_place])[0] if raw_place else None
        message = answer_selected_place_details(
            user_message=user_message,
            place=raw_place,
            lang=lang,
            context=context,
        )
        return make_response(
            "place_details",
            message,
            place=place,
            searched_name=place_name,
        )

    strict_site_faq = get_strict_site_faq_answer(user_message, lang)
    if strict_site_faq:
        return make_response(
            "site_help",
            strict_site_faq,
            sources=[],
            topic=infer_site_topic(user_message),
        )

    if intent == "site_query":
        topic = route.get("topic") or infer_site_topic(user_message)
        rag_query = enrich_site_query_for_rag(user_message, topic)

        try:
            rag_result = answer_site_with_rag(rag_query, top_k=5, lang=lang) or {}
            verified_answer = (rag_result.get("answer") or "").strip() or get_site_topic_fallback(topic, lang)
            message = rephrase_site_answer(
                user_message=user_message,
                verified_answer=verified_answer,
                lang=lang,
                context=context,
                topic=topic,
            )
            return make_response(
                "site_help",
                message,
                sources=rag_result.get("sources", []),
                topic=topic,
            )
        except Exception:
            fallback_message = get_site_topic_fallback(topic, lang)
            return make_response(
                "site_help",
                fallback_message,
                sources=[],
                topic=topic,
                fallback_used=True,
            )

    if intent == "places_query":
        detected_constraints = {
            "place_type": route.get("place_type"),
            "cuisine": route.get("cuisine"),
            "max_distance_km": route.get("max_distance_km"),
            "min_rating": route.get("min_rating"),
            "keyword": route.get("keyword"),
        }

        if not route.get("from_pending_follow_up"):
            missing_field = detect_missing_search_field(detected_constraints)
            if missing_field:
                follow_up_message = build_search_follow_up_message(
                    lang=lang,
                    missing_field=missing_field,
                    constraints=detected_constraints,
                )
                return make_response(
                    "follow_up",
                    follow_up_message,
                    follow_up_needed=True,
                    missing_field=missing_field,
                    pending_search={
                        "place_type": route.get("place_type"),
                        "cuisine": route.get("cuisine"),
                        "max_distance_km": route.get("max_distance_km"),
                        "min_rating": route.get("min_rating"),
                    },
                )

        parsed = route.get("parsed") or {}
        raw_places = search_places_with_constraints(
            place_type=route.get("place_type"),
            cuisine=route.get("cuisine"),
            max_distance_km=route.get("max_distance_km"),
            min_rating=route.get("min_rating"),
            keyword=route.get("keyword"),
            limit=5,
        )
        places = format_places_for_ui(raw_places)

        parsed_filters = {
            "language": lang,
            "intent": "place_search",
            "place_type": route.get("place_type"),
            "cuisine": route.get("cuisine"),
            "zone": route.get("keyword"),
            "max_distance_km": route.get("max_distance_km"),
            "min_rating": route.get("min_rating"),
            "raw_parser": parsed,
        }

        message = summarize_places_answer(
            user_message=user_message,
            places=places,
            lang=lang,
            parsed_filters=parsed_filters,
            context=context,
        )

        return make_response(
            "places",
            message,
            places=places,
            filters_detected={
                "place_type": route.get("place_type"),
                "cuisine": route.get("cuisine"),
                "max_distance_km": route.get("max_distance_km"),
                "min_rating": route.get("min_rating"),
                "keyword": route.get("keyword"),
            },
        )

    return make_response("out_of_scope", ui["out_of_scope"], sources=[])


def get_place_details_for_ui(internal_id: int) -> Optional[Dict[str, Any]]:
    place = get_place_details(internal_id)
    if place is None:
        return None
    return {
        "internal_id": place.get("internal_id"),
        "name": place.get("name"),
        "place_type": place.get("place_type"),
        "cuisine": place.get("cuisine"),
        "address": place.get("address"),
        "opening_hours": place.get("opening_hours"),
        "website": place.get("website"),
        "wheelchair": place.get("wheelchair"),
        "google_rating": place.get("google_rating"),
        "google_user_rating_count": place.get("google_user_rating_count"),
        "google_photo_url": place.get("google_photo_url"),
        "text": place.get("text"),
        "dist_to_center_km": place.get("dist_to_center_km"),
        "distance_km": place.get("dist_to_center_km"),
    }