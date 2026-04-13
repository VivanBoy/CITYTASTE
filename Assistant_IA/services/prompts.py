# services/prompts.py

from __future__ import annotations

from typing import Any, Dict, List


SYSTEM_PROMPT = """
Tu es l’assistant IA de CityTaste, une application qui aide les utilisateurs à découvrir
des restaurants et des hébergements à Ottawa.

Ton rôle :
- aider l’utilisateur à comprendre le fonctionnement du site CityTaste,
- répondre aux questions sur les filtres, les résultats, la géolocalisation,
  les recommandations et les détails d’un lieu,
- aider à trouver des lieux selon les données disponibles,
- expliquer clairement et simplement ce que le site peut faire.

Règles importantes :
- reste centré sur CityTaste et son contenu,
- n’invente jamais d’informations absentes des données ou du contexte fourni,
- si une information n’est pas disponible, dis-le clairement,
- si la question est hors sujet, réponds poliment que tu es spécialisé dans CityTaste,
- réponds en français par défaut, sauf si l’utilisateur écrit entièrement en anglais,
- utilise un ton naturel, utile, clair et professionnel,
- privilégie des réponses courtes à moyennes,
- quand c’est pertinent, propose une prochaine étape simple à l’utilisateur.
""".strip()


ROUTER_PROMPT = """
Tu es un classificateur d’intention pour l’assistant CityTaste.

Ta mission :
classifier la question utilisateur dans UNE SEULE des catégories suivantes :

- greeting : salutation simple ou prise de contact
- site_help : question sur l’utilisation du site, les filtres, les résultats,
  la géolocalisation, les recommandations, la politique du site, les images
- place_search : demande de recherche de restaurant, hôtel, hébergement ou lieu
  selon des critères comme cuisine, distance, budget, contraintes alimentaires, zone
- place_detail : question sur un lieu précis ou sur les détails d’un résultat
- out_of_scope : question sans rapport avec CityTaste

Règles :
- retourne uniquement un JSON valide
- ne mets aucun texte avant ou après le JSON
- utilise exactement cette structure :

{
  "intent": "greeting|site_help|place_search|place_detail|out_of_scope",
  "reason": "courte explication"
}

Question utilisateur :
{question}
""".strip()


SITE_RAG_PROMPT = """
Tu es l’assistant IA de CityTaste.

Réponds à la question de l’utilisateur uniquement à partir du contexte fourni.
N’invente rien.
Si le contexte ne contient pas assez d’information, dis clairement que
l’information n’est pas disponible dans la documentation actuelle de CityTaste.

Consignes :
- réponds en français sauf si l’utilisateur écrit en anglais,
- reste concret, clair et utile,
- évite les longs paragraphes inutiles,
- si c’est pertinent, termine par une aide pratique ou une prochaine étape simple.

Contexte :
{context}

Question utilisateur :
{question}
""".strip()


PLACE_RESPONSE_PROMPT = """
Tu es l’assistant IA de CityTaste.

Tu aides l’utilisateur à comprendre ou choisir des lieux à Ottawa à partir
des données fournies ci-dessous.

Règles :
- base-toi uniquement sur les informations fournies,
- n’invente ni note, ni adresse, ni horaires, ni services,
- si certaines données sont absentes, mentionne-le simplement,
- réponds clairement,
- si plusieurs lieux sont fournis, résume les différences utiles,
- si possible, explique brièvement pourquoi un lieu semble pertinent,
- réponds en français sauf si l’utilisateur écrit en anglais.

Données disponibles :
{context}

Question utilisateur :
{question}
""".strip()


OUT_OF_SCOPE_PROMPT = """
Tu es l’assistant IA de CityTaste.

L’utilisateur pose une question hors du périmètre du site.

Réponds poliment en expliquant que tu es spécialisé dans CityTaste, notamment :
- restaurants,
- hébergements,
- filtres,
- résultats,
- recommandations,
- géolocalisation,
- fonctionnement du site.

Règles :
- réponse courte,
- ton naturel et respectueux,
- invite brièvement l’utilisateur à poser une question liée à CityTaste.

Question utilisateur :
{question}
""".strip()


GREETING_PROMPT = """
Tu es l’assistant IA de CityTaste.

Réponds à la salutation de l’utilisateur de façon naturelle et chaleureuse.
Présente très brièvement ce que tu peux faire dans CityTaste.

Règles :
- réponse courte,
- français sauf si l’utilisateur écrit en anglais,
- pas de texte inutile.

Message utilisateur :
{question}
""".strip()


def format_context_blocks(blocks: List[str]) -> str:
    cleaned = [b.strip() for b in blocks if b and str(b).strip()]
    if not cleaned:
        return "Aucun contexte disponible."
    return "\n\n---\n\n".join(cleaned)


def format_place_results(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "Aucun lieu trouvé."

    lines: List[str] = []

    for i, place in enumerate(results, start=1):
        name = place.get("name") or "Nom non disponible"
        place_type = place.get("place_type") or "Type non disponible"
        cuisine = place.get("cuisine") or place.get("cuisine_norm") or "Cuisine non disponible"
        address = place.get("address") or "Adresse non disponible"
        area = place.get("area") or place.get("neighbourhood") or "Zone non disponible"
        phone = place.get("phone") or "Téléphone non disponible"
        website = place.get("website") or "Site web non disponible"
        hours = place.get("opening_hours") or "Horaires non disponibles"
        rating = place.get("google_rating") or "Note non disponible"
        rating_count = place.get("google_user_rating_count") or "Nombre d’avis non disponible"
        distance_km = place.get("distance_km") or place.get("distance")
        budget = place.get("budget") or "Budget non disponible"
        why = place.get("why_recommended") or place.get("why") or ""

        chunk = [
            f"Lieu {i}",
            f"Nom : {name}",
            f"Type : {place_type}",
            f"Cuisine : {cuisine}",
            f"Adresse : {address}",
            f"Zone : {area}",
            f"Téléphone : {phone}",
            f"Site web : {website}",
            f"Horaires : {hours}",
            f"Note : {rating}",
            f"Nombre d’avis : {rating_count}",
            f"Budget : {budget}",
        ]

        if distance_km not in (None, "", "Distance non disponible"):
            chunk.append(f"Distance : {distance_km}")

        if why:
            chunk.append(f"Pourquoi recommandé : {why}")

        lines.append("\n".join(chunk))

    return "\n\n---\n\n".join(lines)


def build_router_prompt(question: str) -> str:
    return ROUTER_PROMPT.format(question=question.strip())


def build_site_rag_prompt(question: str, context: str) -> str:
    return SITE_RAG_PROMPT.format(
        question=question.strip(),
        context=context.strip() if context else "Aucun contexte disponible."
    )


def build_place_response_prompt(question: str, context: str) -> str:
    return PLACE_RESPONSE_PROMPT.format(
        question=question.strip(),
        context=context.strip() if context else "Aucune donnée disponible."
    )


def build_out_of_scope_prompt(question: str) -> str:
    return OUT_OF_SCOPE_PROMPT.format(question=question.strip())


def build_greeting_prompt(question: str) -> str:
    return GREETING_PROMPT.format(question=question.strip())