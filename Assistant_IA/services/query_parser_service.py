from __future__ import annotations

import re
import unicodedata
from typing import Dict, Iterable, List, Optional, Tuple

try:
    from rapidfuzz import fuzz, process
    HAS_RAPIDFUZZ = True
except Exception:
    HAS_RAPIDFUZZ = False


PLACE_TYPE_ALIASES: Dict[str, List[str]] = {
    "restaurant": [
        "restaurant",
        "resto",
        "eat",
        "food",
        "dining",
        "meal",
        "cuisine",
    ],
    "accommodation": [
        "accommodation",
        "hebergement",
        "hébergement",
        "hotel",
        "hotels",
        "motel",
        "motels",
        "hostel",
        "hostels",
        "auberge",
        "guest house",
        "guesthouse",
        "guest houses",
    ],
}

MANUAL_CUISINE_ALIASES: Dict[str, List[str]] = {
    "italian": ["italian", "italien", "italienne", "cuisine italienne", "restaurant italien"],
    "chinese": ["chinese", "chinois", "chinoise", "cuisine chinoise", "restaurant chinois"],
    "indian": ["indian", "indien", "indienne", "cuisine indienne", "restaurant indien"],
    "african": ["african", "africain", "africaine", "cuisine africaine", "restaurant africain"],
    "vietnamese": ["vietnamese", "vietnamien", "vietnamienne", "cuisine vietnamienne"],
    "japanese": ["japanese", "japonais", "japonaise", "cuisine japonaise"],
    "korean": ["korean", "coreen", "coréen", "coréenne", "cuisine coréenne", "cuisine coreenne"],
    "thai": ["thai", "thaï", "cuisine thai", "cuisine thaïlandaise", "thai food"],
    "lebanese": ["lebanese", "libanais", "libanaise", "cuisine libanaise"],
    "ethiopian": ["ethiopian", "ethiopien", "éthiopien", "ethiopienne", "éthiopienne"],
    "eritrean": ["eritrean", "erythreen", "érythréen", "erythreenne", "érythréenne"],
    "mexican": ["mexican", "mexicain", "mexicaine", "cuisine mexicaine"],
    "turkish": ["turkish", "turc", "turque", "cuisine turque"],
    "pakistani": ["pakistani", "pakistanais", "pakistanaise"],
    "greek": ["greek", "grec", "grecque", "cuisine grecque"],
    "french": ["french", "francais", "français", "francaise", "française", "cuisine française"],
    "american": ["american", "americain", "américain", "americaine", "américaine"],
    "pizza": ["pizza", "pizzeria"],
    "burger": ["burger", "burgers", "hamburger"],
    "seafood": ["seafood", "fruits de mer", "poisson", "poissons"],
}

MANUAL_ZONE_ALIASES: Dict[str, List[str]] = {
    "downtown": ["downtown", "centre", "centre ville", "centre-ville", "centre city", "city centre"],
    "st_laurent": ["st laurent", "st-laurent", "saint laurent", "saint-laurent"],
    "montreal_road": ["montreal road", "montreal rd", "montreal", "montréal road", "montréal rd"],
    "byward_market": ["byward market", "byward", "marche byward", "marché byward"],
    "bank_street": ["bank street", "bank st", "rue bank"],
    "sandy_hill": ["sandy hill"],
    "kanata": ["kanata"],
    "orleans": ["orleans", "orléans"],
    "nepean": ["nepean", "népean"],
    "glebe": ["glebe", "the glebe"],
    "westboro": ["westboro"],
    "barrhaven": ["barrhaven"],
}

FAQ_KEYWORDS = [
    "how",
    "comment",
    "what is",
    "c est quoi",
    "c'est quoi",
    "does citytaste",
    "citytaste permet",
    "reservation",
    "réservation",
    "reserve",
    "réserver",
    "location",
    "localisation",
    "filters",
    "filtres",
    "ranked",
    "classement",
    "how do i use",
    "comment utiliser",
    "what does citytaste do",
    "a quoi sert",
    "à quoi sert",
]

SEARCH_HINTS = [
    "restaurant",
    "resto",
    "hotel",
    "motel",
    "hostel",
    "auberge",
    "hebergement",
    "hébergement",
    "cuisine",
    "find",
    "trouve",
    "cherche",
    "search",
    "near",
    "around",
    "proche",
    "pres de",
    "près de",
    "vers",
    "downtown",
    "centre",
]

FRENCH_MARKERS = [
    "bonjour",
    "salut",
    "trouve",
    "cherche",
    "proche",
    "pres de",
    "près de",
    "centre-ville",
    "cuisine",
    "hébergement",
    "restaurant",
]

ENGLISH_MARKERS = [
    "hello",
    "find",
    "search",
    "near",
    "around",
    "downtown",
    "accommodation",
    "restaurant",
    "hotel",
]


def normalize_text(text: str) -> str:
    text = (text or "").lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("&", " and ")
    text = text.replace("st.", "saint ")
    text = text.replace("mtl", "montreal")
    text = re.sub(r"\brd\b", "road", text)
    text = re.sub(r"\bave\b", "avenue", text)
    text = re.sub(r"\bblvd\b", "boulevard", text)

    typo_map = {
        "cusine": "cuisine",
        "restarant": "restaurant",
        "restoaurant": "restaurant",
        "hebergement": "hebergement",
        "restauration": "restaurant",
    }
    for bad, good in typo_map.items():
        text = text.replace(bad, good)

    text = re.sub(r"[^\w\s\-]", " ", text)
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _canonical_token(value: str) -> str:
    return normalize_text(value).replace(" ", "_")


def _unique_keep_order(values: Iterable[str]) -> List[str]:
    seen = set()
    out = []
    for value in values:
        if not value:
            continue
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _make_text_variants(value: str) -> List[str]:
    base = normalize_text(value)
    if not base:
        return []

    variants = [
        base,
        base.replace("_", " "),
        base.replace(" ", "-"),
        f"cuisine {base}",
        f"restaurant {base}",
        f"{base} restaurant",
    ]

    if base.startswith("saint "):
        short = base.replace("saint ", "st ", 1)
        variants.extend([short, short.replace(" ", "-")])

    if " road" in base:
        variants.extend([base.replace(" road", " rd"), base.replace(" road", " road")])

    if " avenue" in base:
        variants.extend([base.replace(" avenue", " ave")])

    if " boulevard" in base:
        variants.extend([base.replace(" boulevard", " blvd")])

    return _unique_keep_order(normalize_text(v) for v in variants if v)


def _build_alias_map(
    canonical_values: Optional[Iterable[str]],
    manual_aliases: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, List[str]]:
    alias_map: Dict[str, List[str]] = {}

    if canonical_values:
        for raw_value in canonical_values:
            canonical = _canonical_token(str(raw_value))
            if not canonical:
                continue
            alias_map.setdefault(canonical, [])
            alias_map[canonical].extend(_make_text_variants(str(raw_value)))

    if manual_aliases:
        for canonical, aliases in manual_aliases.items():
            canonical_key = _canonical_token(canonical)
            alias_map.setdefault(canonical_key, [])
            alias_map[canonical_key].extend(_make_text_variants(canonical))
            alias_map[canonical_key].extend(_make_text_variants(alias) for alias in aliases)  # type: ignore

    cleaned_map: Dict[str, List[str]] = {}
    for canonical, aliases in alias_map.items():
        flat_aliases: List[str] = []
        for item in aliases:
            if isinstance(item, list):
                flat_aliases.extend(item)
            else:
                flat_aliases.append(item)

        cleaned_map[canonical] = _unique_keep_order(
            normalize_text(alias) for alias in flat_aliases if normalize_text(alias)
        )

    return cleaned_map


def build_cuisine_alias_map(cuisine_values: Optional[Iterable[str]] = None) -> Dict[str, List[str]]:
    return _build_alias_map(cuisine_values, MANUAL_CUISINE_ALIASES)


def build_zone_alias_map(zone_values: Optional[Iterable[str]] = None) -> Dict[str, List[str]]:
    return _build_alias_map(zone_values, MANUAL_ZONE_ALIASES)


def _flatten_alias_map(alias_map: Dict[str, List[str]]) -> Dict[str, str]:
    flat: Dict[str, str] = {}
    for canonical, aliases in alias_map.items():
        flat[normalize_text(canonical.replace("_", " "))] = canonical
        for alias in aliases:
            flat[normalize_text(alias)] = canonical
    return flat


def _generate_spans(text: str, max_ngram: int = 5) -> List[str]:
    tokens = text.split()
    spans = [text]
    for n in range(1, min(max_ngram, len(tokens)) + 1):
        for i in range(len(tokens) - n + 1):
            spans.append(" ".join(tokens[i : i + n]))
    spans = sorted(_unique_keep_order(spans), key=lambda s: (-len(s.split()), -len(s)))
    return spans


def _score_ratio(a: str, b: str) -> int:
    if HAS_RAPIDFUZZ:
        return int(fuzz.token_sort_ratio(a, b))

    import difflib
    return int(difflib.SequenceMatcher(None, a, b).ratio() * 100)


def _best_match(query: str, choices: List[str]) -> Tuple[Optional[str], int]:
    if not query or not choices:
        return None, 0

    if HAS_RAPIDFUZZ:
        best = process.extractOne(query, choices, scorer=fuzz.token_sort_ratio)
        if not best:
            return None, 0
        return best[0], int(best[1])

    best_choice = None
    best_score = 0
    for choice in choices:
        score = _score_ratio(query, choice)
        if score > best_score:
            best_choice = choice
            best_score = score
    return best_choice, best_score


def resolve_entity_from_text(
    text: str,
    alias_map: Dict[str, List[str]],
    threshold: int = 84,
) -> Tuple[Optional[str], Optional[str], int]:
    text = normalize_text(text)
    if not text:
        return None, None, 0

    flat = _flatten_alias_map(alias_map)
    choices = list(flat.keys())

    best_canonical = None
    best_raw = None
    best_score = 0

    for span in _generate_spans(text, max_ngram=5):
        if span in flat:
            return flat[span], span, 100

        matched_alias, score = _best_match(span, choices)
        if matched_alias and score >= threshold:
            canonical = flat[matched_alias]
            if score > best_score:
                best_canonical = canonical
                best_raw = span
                best_score = score

    return best_canonical, best_raw, best_score


def detect_language(text: str) -> str:
    text = normalize_text(text)
    fr_score = sum(1 for marker in FRENCH_MARKERS if marker in text)
    en_score = sum(1 for marker in ENGLISH_MARKERS if marker in text)

    if fr_score > en_score:
        return "fr"
    if en_score > fr_score:
        return "en"

    if any(word in text for word in ["trouve", "cherche", "proche", "hebergement", "hébergement"]):
        return "fr"

    return "en"


def _extract_zone_candidate(text: str) -> str:
    text = normalize_text(text)
    patterns = [
        r"(?:near|around|close to|in)\s+([a-z0-9\s]+)$",
        r"(?:proche de|pres de|près de|vers|dans|autour de)\s+([a-z0-9\s]+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            candidate = normalize_text(match.group(1))
            if candidate:
                return candidate
    return ""


def _detect_place_type(text: str) -> Tuple[Optional[str], int]:
    text = normalize_text(text)

    for canonical, aliases in PLACE_TYPE_ALIASES.items():
        for alias in aliases:
            alias_norm = normalize_text(alias)
            if alias_norm and alias_norm in text:
                return canonical, 100

    alias_map = _build_alias_map(PLACE_TYPE_ALIASES.keys(), PLACE_TYPE_ALIASES)
    resolved, _, score = resolve_entity_from_text(text, alias_map, threshold=88)
    return resolved, score


def detect_intent(
    text: str,
    place_type: Optional[str],
    cuisine: Optional[str],
    zone: Optional[str],
) -> str:
    text = normalize_text(text)

    search_score = sum(1 for marker in SEARCH_HINTS if marker in text)
    faq_score = sum(1 for marker in FAQ_KEYWORDS if marker in text)

    if place_type or cuisine or zone:
        return "place_search"

    if search_score > faq_score and search_score > 0:
        return "place_search"

    if faq_score > 0 or text.endswith("?"):
        return "faq"

    return "unknown"


def parse_user_query(
    user_query: str,
    cuisine_values: Optional[Iterable[str]] = None,
    zone_values: Optional[Iterable[str]] = None,
) -> Dict[str, object]:
    raw_query = user_query or ""
    clean = normalize_text(raw_query)

    cuisine_alias_map = build_cuisine_alias_map(cuisine_values)
    zone_alias_map = build_zone_alias_map(zone_values)

    language = detect_language(raw_query)
    place_type, place_type_score = _detect_place_type(clean)

    cuisine, raw_cuisine, cuisine_score = resolve_entity_from_text(
        clean,
        cuisine_alias_map,
        threshold=84,
    )

    zone_candidate = _extract_zone_candidate(clean)
    if zone_candidate:
        zone, raw_zone, zone_score = resolve_entity_from_text(
            zone_candidate,
            zone_alias_map,
            threshold=80,
        )
        raw_zone = raw_zone or zone_candidate
    else:
        zone, raw_zone, zone_score = resolve_entity_from_text(
            clean,
            zone_alias_map,
            threshold=88,
        )

    if cuisine and not place_type:
        place_type = "restaurant"
        place_type_score = max(place_type_score, 70)

    intent = detect_intent(clean, place_type, cuisine, zone)

    needs_clarification = False
    clarification_question = None

    if intent == "place_search" and not any([place_type, cuisine, zone]):
        needs_clarification = True
        clarification_question = (
            "Quel type de lieu, quelle cuisine ou quelle zone veux-tu ?"
            if language == "fr"
            else "Which type of place, cuisine, or area do you want?"
        )

    return {
        "raw_query": raw_query,
        "normalized_query": clean,
        "language": language,
        "intent": intent,
        "place_type": place_type,
        "cuisine": cuisine,
        "zone": zone,
        "raw_cuisine": raw_cuisine,
        "raw_zone": raw_zone,
        "needs_clarification": needs_clarification,
        "clarification_question": clarification_question,
        "confidence": {
            "place_type": place_type_score,
            "cuisine": cuisine_score,
            "zone": zone_score,
        },
    }