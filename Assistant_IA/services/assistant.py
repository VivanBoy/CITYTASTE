import re
import unicodedata
from services.place_service import search_places, get_place_details
from services.site_service import answer_site_help


def normalize_text(text):
    text = "" if text is None else str(text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_site_question(user_message):
    text = normalize_text(user_message)

    site_keywords = [
        "site", "page", "interface", "filtre", "filtres", "recherche",
        "distance", "image", "images", "detail", "details",
        "comment", "fonctionne", "utiliser", "fiche", "resultat", "resultats"
    ]

    return any(word in text for word in site_keywords)


def detect_place_type(text):
    if any(word in text for word in ["restaurant", "resto", "manger", "repas"]):
        return "restaurant"

    if any(word in text for word in ["hotel", "hôtel", "hebergement", "hébergement", "hostel", "motel", "logement"]):
        return "hotel"

    return None


def detect_cuisine(text):
    cuisine_map = {
        "italian": ["italian", "italien", "italienne"],
        "indian": ["indian", "indien", "indienne"],
        "chinese": ["chinese", "chinois", "chinoise"],
        "pizza": ["pizza", "pizzeria"],
        "vietnamese": ["vietnamese", "vietnamien", "vietnamienne"],
        "african": ["african", "africain", "africaine"],
        "ethiopian": ["ethiopian", "ethiopien", "ethiopienne"],
        "lebanese": ["lebanese", "libanais", "libanaise"],
        "french": ["french", "francais", "française", "francais"],
    }

    for canonical, variants in cuisine_map.items():
        if any(v in text for v in variants):
            return canonical

    return None


def detect_max_distance_km(text):
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*km", text)
    if match:
        return float(match.group(1).replace(",", "."))

    if any(expr in text for expr in ["proche du centre", "pres du centre", "près du centre", "centre ville", "centre-ville"]):
        return 3.0

    return None


def detect_min_rating(text):
    if any(expr in text for expr in [
        "bonne note", "bien note", "bien notee", "bien notees",
        "bonne evaluation", "bonne notation", "tres bien note",
        "très bien noté", "top rated", "bon rating"
    ]):
        return 4.0

    return None


def format_places_for_ui(places):
    formatted = []

    for p in places:
        formatted.append({
            "internal_id": p.get("internal_id"),
            "name": p.get("name"),
            "place_type": p.get("place_type"),
            "cuisine": p.get("cuisine"),
            "address": p.get("address"),
            "dist_to_center_km": p.get("dist_to_center_km"),
            "google_rating": p.get("google_rating"),
            "google_user_rating_count": p.get("google_user_rating_count"),
            "website": p.get("website"),
            "google_photo_url": p.get("google_photo_url"),
        })

    return formatted


def build_places_message(places):
    if not places:
        return "Je n’ai pas trouvé de lieu correspondant pour le moment."

    lines = ["J’ai trouvé quelques options intéressantes :"]

    for i, p in enumerate(places[:3], start=1):
        name = p.get("name") or "Lieu sans nom"
        cuisine = p.get("cuisine") or "cuisine non précisée"
        rating = p.get("google_rating")
        dist = p.get("dist_to_center_km")
        address = p.get("address") or "adresse non disponible"

        rating_txt = f"{rating}/5" if rating is not None else "note non disponible"
        dist_txt = f"{dist:.1f} km du centre" if isinstance(dist, (int, float)) else "distance non disponible"

        lines.append(f"{i}. {name} — {cuisine} — {rating_txt} — {dist_txt} — {address}")

    return "\n".join(lines)


def simple_citytaste_assistant(user_message):
    text = normalize_text(user_message)

    if is_site_question(user_message):
        return {
            "type": "site_help",
            "message": answer_site_help(user_message)
        }

    place_type = detect_place_type(text)
    cuisine = detect_cuisine(text)
    max_distance_km = detect_max_distance_km(text)
    min_rating = detect_min_rating(text)

    places = search_places(
        place_type=place_type,
        cuisine=cuisine,
        max_distance_km=max_distance_km,
        min_rating=min_rating,
        keyword=None,
        limit=5
    )

    formatted_places = format_places_for_ui(places)

    return {
        "type": "places",
        "message": build_places_message(formatted_places),
        "places": formatted_places,
        "filters_detected": {
            "place_type": place_type,
            "cuisine": cuisine,
            "max_distance_km": max_distance_km,
            "min_rating": min_rating
        }
    }


def get_place_details_for_ui(internal_id):
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
    }