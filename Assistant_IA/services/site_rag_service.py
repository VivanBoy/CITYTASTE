from __future__ import annotations

from pathlib import Path
import json
import re
import unicodedata
from typing import Any, Dict, List, Optional, Set

import joblib
import numpy as np
from sentence_transformers import SentenceTransformer


BASE_DIR = Path(__file__).resolve().parent.parent
INDEX_DIR = BASE_DIR / "data" / "site_rag_index"

CHUNKS_PATH = INDEX_DIR / "chunks.json"
EMBEDDINGS_PATH = INDEX_DIR / "embeddings.npy"
INDEX_PATH = INDEX_DIR / "nn_index.joblib"
METADATA_PATH = INDEX_DIR / "metadata.json"

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


ENGLISH_HINTS = {
    "the", "a", "an", "and", "or", "but", "with", "for", "from", "to", "of",
    "in", "on", "near", "best", "good", "restaurant", "hotel", "food",
    "where", "what", "which", "how", "can", "could", "do", "does", "is",
    "are", "open", "closed", "rating", "price", "cheap", "expensive",
    "show", "find", "recommend", "recommended", "recommendation", "looking", "help",
    "filter", "filters", "search", "results", "location", "position",
    "book", "booking", "reserve", "details", "works", "use", "sort", "sorting",
    "why", "shown", "appear", "appears", "order", "ranked"
}

FRENCH_HINTS = {
    "le", "la", "les", "un", "une", "des", "et", "ou", "mais", "avec", "pour",
    "de", "du", "dans", "sur", "pres", "près", "meilleur", "bon", "restaurant", "hôtel",
    "nourriture", "où", "quoi", "quel", "quelle", "comment", "peux", "peut",
    "est", "sont", "ouvert", "fermé", "note", "prix", "pas", "cher",
    "montre", "trouve", "recommande", "recommandation", "cherche", "aide", "filtre", "filtres",
    "recherche", "résultats", "localisation", "position", "réservation",
    "réserver", "détails", "fonctionne", "utiliser", "tri", "trier",
    "pourquoi", "affiche", "apparait", "propose", "classement"
}

TOPIC_EXPANSIONS = {
    "filters": (
        "filters filter filtering how to use filters "
        "filtres filtre filtrage comment utiliser les filtres "
        "type cuisine budget distance dietary preferences sorting tri results"
    ),
    "location": (
        "location geolocation geolocalisation localisation position gps "
        "enable location allow location distance nearby near me autour de moi "
        "proche près de moi browser permission centre ottawa reference point"
    ),
    "booking": (
        "booking book reserve reservation reservations reserver "
        "external website site web telephone phone contact no direct booking"
    ),
    "results": (
        "results detail details fiche resultat resultats result photo image rating note "
        "hours horaires website address adresse detailed card detailed view"
    ),
    "sorting": (
        "sort sorting order order by tri trier classement pertinence relevance distance rating note"
    ),
    "recommendation": (
        "recommend recommendation recommended why shown why this place why this result "
        "why recommended explanation ranking relevance suggestion suggested appears appear "
        "recommande recommandation pourquoi ce lieu pourquoi ce resultat "
        "pourquoi ce lieu est recommande pourquoi ce resultat apparait "
        "type cuisine distance note filters pertinence"
    ),
    "usage": (
        "how it works how to use comment fonctionne comment utiliser "
        "filters results details location recommendation"
    ),
}


def normalize_text(text: str) -> str:
    text = "" if text is None else str(text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize_simple(text: str) -> Set[str]:
    return set(normalize_text(text).split())


def detect_query_language(text: str) -> str:
    if not text or not text.strip():
        return "fr"

    t = text.strip().lower()
    if re.search(r"[àâçéèêëîïôùûüÿœæ]", t):
        return "fr"

    words = re.findall(r"\b[\w']+\b", t)
    en_score = sum(1 for w in words if w in ENGLISH_HINTS)
    fr_score = sum(1 for w in words if w in FRENCH_HINTS)

    if re.search(r"\b(can you|i want|i need|show me|find me|what is|where is|how do i|how can i|do i need|can i|why)\b", t):
        en_score += 3
    if re.search(r"\b(peux[- ]?tu|je veux|j ai besoin|j'ai besoin|montre[- ]moi|trouve[- ]moi|qu est ce que|qu'est-ce que|ou est|où est|comment|dois[- ]je|puis[- ]je|pourquoi)\b", t):
        fr_score += 3

    return "en" if en_score > fr_score else "fr"


def is_recommendation_query(query: str) -> bool:
    q = normalize_text(query)

    explicit_phrases = [
        "why is this place recommended",
        "why this place",
        "why is this result recommended",
        "why does this place appear",
        "why does this result appear",
        "why is this shown",
        "why was this shown",
        "why recommended",
        "how does recommendation work",
        "pourquoi ce lieu est recommande",
        "pourquoi ce lieu apparait",
        "pourquoi ce resultat apparait",
        "pourquoi ce resultat est recommande",
        "comment fonctionne la recommandation",
        "pourquoi ce lieu est propose",
        "pourquoi ce resultat est propose",
    ]
    if any(phrase in q for phrase in explicit_phrases):
        return True

    tokens = tokenize_simple(q)
    why_tokens = {"why", "pourquoi"}
    recommendation_tokens = {
        "recommend", "recommended", "recommendation", "recommande", "recommandation",
        "shown", "appear", "appears", "apparait", "affiche", "propose", "suggested",
        "result", "results", "resultat", "resultats"
    }
    return bool(tokens & why_tokens) and bool(tokens & recommendation_tokens)


def get_ui_text(lang: str) -> Dict[str, str]:
    if lang == "en":
        return {
            "not_found": "I couldn't find relevant information in the CityTaste help content.",
            "filters": "You can use the filters to narrow the results by place type, cuisine, budget, distance, and other preferences available in the interface.",
            "location": "Location is optional. If the interface shows a location button, clicking it lets your browser ask for permission so CityTaste can better suggest nearby places.",
            "booking": "CityTaste mainly helps users discover places. Booking, when available, is usually done through the place's website or contact information.",
            "results": "You can open a result to see more details such as the address, opening hours, website, rating, and photo when available.",
            "sorting": "Sorting changes the order of the results based on the selected criterion, such as relevance, distance, or rating.",
            "recommendation": "A place can be recommended because it matches useful criteria such as the place type, cuisine, distance indicator, rating, or the amount of available details.",
            "usage": "To use CityTaste, start with what you want to find, refine with the available filters, and open a result card for more details.",
        }

    return {
        "not_found": "Je n’ai pas trouvé d’information pertinente dans l’aide de CityTaste.",
        "filters": "Tu peux utiliser les filtres pour affiner les résultats selon le type de lieu, la cuisine, le budget, la distance et d’autres préférences disponibles dans l’interface.",
        "location": "La localisation est facultative. Si l’interface affiche un bouton de localisation, cliquer dessus permet à ton navigateur de demander l’autorisation afin que CityTaste propose plus précisément des lieux proches.",
        "booking": "CityTaste aide surtout à découvrir des lieux. La réservation, quand elle est possible, se fait généralement via le site web ou les coordonnées du lieu.",
        "results": "Tu peux ouvrir un résultat pour voir plus de détails comme l’adresse, les horaires, le site web, la note et la photo quand ces informations sont disponibles.",
        "sorting": "Le tri change l’ordre des résultats selon le critère choisi, par exemple la pertinence, la distance ou la note.",
        "recommendation": "Un lieu peut être recommandé parce qu’il correspond à des critères utiles comme le type de lieu, la cuisine, la distance indicative, la note, ou la richesse des informations disponibles.",
        "usage": "Pour utiliser CityTaste, commence par choisir ce que tu veux trouver, affine avec les filtres disponibles, puis ouvre une fiche résultat pour voir plus de détails.",
    }


def infer_site_topic(query: str) -> Optional[str]:
    q = normalize_text(query)

    if is_recommendation_query(q):
        return "recommendation"
    if any(x in q for x in ["filtre", "filtres", "filter", "filters"]):
        return "filters"
    if any(x in q for x in ["tri", "trier", "sort", "sorting", "relevance", "pertinence", "order", "classement", "ranked"]):
        return "sorting"
    if any(x in q for x in ["position", "localisation", "geolocalisation", "gps", "location", "geolocation", "distance", "nearby", "near me"]):
        return "location"
    if any(x in q for x in ["reservation", "reservations", "reserver", "book", "booking", "reserve"]):
        return "booking"
    if any(x in q for x in ["detail", "details", "fiche", "resultat", "resultats", "result", "results", "photo", "image"]):
        return "results"
    if any(x in q for x in ["recommande", "recommandation", "recommend", "recommended", "recommendation", "apparait", "affiche", "shown", "appear", "appears", "propose"]):
        return "recommendation"
    if any(x in q for x in ["utiliser", "use", "works", "fonctionne"]):
        return "usage"
    return None


def rewrite_site_query(query: str) -> str:
    topic = infer_site_topic(query)
    if topic and topic in TOPIC_EXPANSIONS:
        return f"{query} {TOPIC_EXPANSIONS[topic]}"
    return query


class SiteRAGService:
    def __init__(self):
        self.chunks = self._load_chunks()
        self.embeddings = self._load_embeddings()
        self.nn_index = self._load_index()
        self.metadata = self._load_metadata()
        embedding_model_name = self.metadata.get("embedding_model_name", DEFAULT_EMBEDDING_MODEL)
        self.embedding_model = SentenceTransformer(embedding_model_name)

        print("\n===== SITE RAG DEBUG =====")
        print("SITE_RAG_SERVICE FILE:", __file__)
        print("CHUNKS PATH:", CHUNKS_PATH)
        print("EMBEDDING MODEL:", embedding_model_name)
        print("==========================\n")

    def _load_chunks(self) -> List[Dict[str, Any]]:
        if not CHUNKS_PATH.exists():
            raise FileNotFoundError(f"Fichier chunks introuvable : {CHUNKS_PATH}")
        with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_embeddings(self):
        if not EMBEDDINGS_PATH.exists():
            raise FileNotFoundError(f"Fichier embeddings introuvable : {EMBEDDINGS_PATH}")
        return np.load(EMBEDDINGS_PATH)

    def _load_index(self):
        if not INDEX_PATH.exists():
            raise FileNotFoundError(f"Index nearest neighbors introuvable : {INDEX_PATH}")
        return joblib.load(INDEX_PATH)

    def _load_metadata(self) -> Dict[str, Any]:
        if not METADATA_PATH.exists():
            return {"embedding_model_name": DEFAULT_EMBEDDING_MODEL}
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def _clean_chunk_text(self, text: str) -> str:
        text = (text or "").strip()
        text = re.sub(r"^##\s+", "", text, flags=re.MULTILINE)
        text = re.sub(r"^#\s+", "", text, flags=re.MULTILINE)
        text = re.sub(r"\n?---\n?", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _extract_best_answer(self, text: str) -> str:
        text = self._clean_chunk_text(text)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if lines and len(lines[0]) < 90 and not lines[0].endswith("."):
            lines = lines[1:]
        return "\n".join(lines).strip()

    def _topic_bonus(self, topic: Optional[str], chunk: Dict[str, Any]) -> float:
        if not topic:
            return 0.0

        title = normalize_text(chunk.get("section_title", ""))
        text = normalize_text(chunk.get("text", ""))
        source_file = normalize_text(chunk.get("source_file", ""))
        bonus = 0.0

        if topic == "filters":
            if any(x in title for x in ["filtre", "filtres", "filter", "filters"]):
                bonus += 0.15
            if any(x in text for x in ["filtre", "filtres", "filter", "filters"]):
                bonus += 0.05
            if "filtres" in source_file or "filters" in source_file:
                bonus += 0.08

        elif topic == "location":
            if any(x in title for x in ["position", "localisation", "location", "distance", "geolocalisation", "geolocation"]):
                bonus += 0.15
            if any(x in text for x in ["position", "localisation", "location", "distance", "nearby", "centre", "reference"]):
                bonus += 0.05
            if "distance" in source_file or "geolocalisation" in source_file or "location" in source_file:
                bonus += 0.08

        elif topic == "booking":
            if any(x in title for x in ["reservation", "booking", "reserve", "reserver"]):
                bonus += 0.15
            if any(x in text for x in ["reservation", "booking", "reserve", "reserver", "site web", "website", "contact"]):
                bonus += 0.05
            if "faq" in source_file or "policy" in source_file or "site_policy" in source_file:
                bonus += 0.03

        elif topic == "results":
            if any(x in title for x in ["detail", "details", "resultat", "resultats", "result", "results", "fiche"]):
                bonus += 0.15
            if any(x in text for x in ["detail", "details", "resultat", "resultats", "photo", "image", "adresse", "address"]):
                bonus += 0.05
            if "resultat" in source_file or "details" in source_file or "details_lieu" in source_file:
                bonus += 0.08

        elif topic == "sorting":
            if any(x in title for x in ["tri", "trier", "sort", "sorting", "pertinence", "relevance", "classement"]):
                bonus += 0.15
            if any(x in text for x in ["tri", "sort", "distance", "note", "rating", "pertinence", "relevance", "ordre"]):
                bonus += 0.05

        elif topic == "recommendation":
            if any(x in title for x in ["recommandation", "recommendation", "recommande", "recommended"]):
                bonus += 0.18
            if any(x in text for x in [
                "recommandation", "recommendation", "recommande", "recommended",
                "pourquoi", "why", "apparait", "appear", "shown", "propose", "matches", "criteria"
            ]):
                bonus += 0.06
            if "recommandation" in source_file or "recommendation" in source_file:
                bonus += 0.10
            if "resultat" in source_file or "faq" in source_file or "site_policy" in source_file:
                bonus += 0.03

        elif topic == "usage":
            if any(x in text for x in ["filtre", "filter", "resultat", "results", "detail", "details", "recommandation", "recommendation"]):
                bonus += 0.05

        return bonus

    def _score_result(self, query: str, chunk: Dict[str, Any]) -> float:
        topic = infer_site_topic(query)
        query_tokens = tokenize_simple(query)
        text_tokens = tokenize_simple(chunk.get("text", ""))
        title_tokens = tokenize_simple(chunk.get("section_title", ""))

        text_overlap = len(query_tokens & text_tokens)
        title_overlap = len(query_tokens & title_tokens)

        important_keywords = {
            "position", "localisation", "geolocalisation", "gps", "location", "geolocation", "distance",
            "filtre", "filtres", "filter", "filters", "results", "resultats", "detail", "details",
            "booking", "reservation", "reserve", "sort", "sorting", "tri", "photo", "image",
            "recommend", "recommended", "recommendation", "recommande", "recommandation",
            "shown", "appear", "appears", "apparait", "affiche", "why", "pourquoi"
        }

        keyword_bonus = 0.0
        if important_keywords & title_tokens:
            keyword_bonus += 0.08
        if important_keywords & text_tokens:
            keyword_bonus += 0.04

        similarity = float(chunk.get("similarity", 0.0))
        topic_bonus = self._topic_bonus(topic, chunk)

        return similarity + (0.03 * text_overlap) + (0.06 * title_overlap) + keyword_bonus + topic_bonus

    def search(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        rewritten_query = rewrite_site_query(query)
        query_vec = self.embedding_model.encode(
            [rewritten_query],
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        n_neighbors = min(len(self.chunks), max(top_k * 5, 10))
        distances, indices = self.nn_index.kneighbors(query_vec, n_neighbors=n_neighbors)

        results = []
        for rank, (idx, dist) in enumerate(zip(indices[0], distances[0]), start=1):
            chunk = self.chunks[idx].copy()
            chunk["rank"] = rank
            chunk["distance"] = float(dist)
            chunk["similarity"] = float(1 - dist)
            chunk["score"] = self._score_result(rewritten_query, chunk)
            results.append(chunk)

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _best_score(self, results: List[Dict[str, Any]]) -> float:
        if not results:
            return 0.0
        return max(float(r.get("score", 0.0)) for r in results)

    def _build_template_answer(self, topic: Optional[str], lang: str) -> Optional[str]:
        ui = get_ui_text(lang)
        if topic and topic in ui:
            return ui[topic]
        return None

    def answer_basic(self, query: str, top_k: int = 3, lang: Optional[str] = None) -> Dict[str, Any]:
        lang = lang or detect_query_language(query)
        ui = get_ui_text(lang)
        topic = infer_site_topic(query)
        results = self.search(query, top_k=max(top_k, 5))
        template_answer = self._build_template_answer(topic, lang)
        best_score = self._best_score(results)

        print("\n===== SITE RAG ANSWER DEBUG =====")
        print("QUERY:", query)
        print("LANG USED:", lang)
        print("TOPIC:", topic)
        print("BEST SCORE:", best_score)
        if results:
            print("TOP 1 TITLE:", results[0].get("section_title"))
            print("TOP 1 FILE:", results[0].get("source_file"))
        print("=================================\n")

        if not results:
            final_answer = template_answer or ui["not_found"]
            return {"answer": final_answer, "sources": [], "top_chunks": []}

        best = results[0]
        clean_answer = self._extract_best_answer(best.get("text", ""))

        strict_topics = {"location", "booking", "filters", "results", "sorting", "recommendation", "usage"}

        if best_score < 0.62:
            final_answer = template_answer or ui["not_found"]
        elif template_answer and best_score < 0.74:
            final_answer = template_answer
        else:
            if topic in strict_topics:
                final_answer = clean_answer or template_answer or ui["not_found"]
            else:
                final_answer = clean_answer or template_answer or ui["not_found"]

        return {
            "answer": final_answer,
            "sources": [
                {
                    "source_file": r.get("source_file"),
                    "section_title": r.get("section_title"),
                    "similarity": r.get("similarity"),
                    "score": r.get("score"),
                }
                for r in results[:top_k]
            ],
            "top_chunks": results[:top_k],
        }


_site_rag_service = None


def get_site_rag_service():
    global _site_rag_service
    if _site_rag_service is None:
        _site_rag_service = SiteRAGService()
    return _site_rag_service


def search_site_docs(query: str, top_k: int = 3, lang: Optional[str] = None):
    service = get_site_rag_service()
    return service.search(query, top_k=top_k)


def answer_site_with_rag(query: str, top_k: int = 3, lang: Optional[str] = None):
    service = get_site_rag_service()
    return service.answer_basic(query, top_k=top_k, lang=lang)