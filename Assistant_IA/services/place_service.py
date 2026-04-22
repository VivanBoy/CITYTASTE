from __future__ import annotations

from pathlib import Path
import re
import sqlite3
from typing import Any, Dict, List, Optional


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "citytaste_ottawa.db"


GENERIC_CENTER_TERMS = {
    "downtown",
    "centre",
    "center",
    "centre ottawa",
    "center ottawa",
    "centre-ville",
    "centreville",
    "centre ville",
    "downtown ottawa",
}


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def clean_value(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value.lower() in {"", "nan", "none", "unknown"}:
            return None
    return value


def row_to_place_dict(row):
    d = dict(row)
    for k, v in d.items():
        d[k] = clean_value(v)
    return d


def normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    value = str(value).strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def normalize_keyword(value: Optional[str]) -> Optional[str]:
    value = normalize_text(value)
    if not value:
        return None

    replacements = {
        "st-laurent": "st laurent",
        "saint-laurent": "saint laurent",
        "centre-ville": "centre ville",
        "montreal rd": "montreal road",
        "montréal rd": "montreal road",
    }
    for src, dst in replacements.items():
        value = value.replace(src, dst)

    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def get_available_cuisines(limit: int = 1000) -> List[str]:
    sql = """
    SELECT DISTINCT cuisine
    FROM places
    WHERE cuisine IS NOT NULL
      AND TRIM(cuisine) <> ''
      AND LOWER(TRIM(cuisine)) NOT IN ('unknown', 'none', 'nan')
    LIMIT ?
    """

    cuisines = set()

    with get_connection() as conn:
        rows = conn.execute(sql, [limit]).fetchall()

    for row in rows:
        raw = clean_value(row["cuisine"])
        if not raw:
            continue

        parts = re.split(r"[,;/|]", str(raw))
        for part in parts:
            item = normalize_text(part)
            if item and item not in {"unknown", "none", "nan"}:
                cuisines.add(item)

    return sorted(cuisines)


def get_available_zones(limit: int = 1000) -> List[str]:
    zones = {
        "downtown",
        "centre ville",
        "st laurent",
        "kanata",
        "orleans",
        "nepean",
        "glebe",
        "westboro",
        "barrhaven",
        "bank street",
        "montreal road",
        "byward market",
        "sandy hill",
    }

    sql = """
    SELECT DISTINCT address, addr_city
    FROM places
    WHERE COALESCE(TRIM(name), '') <> ''
    LIMIT ?
    """

    with get_connection() as conn:
        rows = conn.execute(sql, [limit]).fetchall()

    for row in rows:
        for key in ["address", "addr_city"]:
            raw = clean_value(row[key])
            if not raw:
                continue
            value = normalize_text(raw)
            if value and value not in {"ottawa", "ontario", "canada"}:
                if len(value) <= 40:
                    zones.add(value)

    return sorted(zones)


def search_places(
    place_type=None,
    cuisine=None,
    max_distance_km=None,
    min_rating=None,
    keyword=None,
    limit=5
):
    sql = """
    SELECT
        rowid AS internal_id,
        osm_type,
        osm_id,
        name,
        place_type,
        amenity,
        tourism,
        cuisine,
        lat,
        lon,
        address,
        addr_city,
        opening_hours,
        wheelchair,
        website,
        google_rating,
        google_user_rating_count,
        google_photo_url,
        dist_to_center_km,
        text
    FROM places
    WHERE COALESCE(TRIM(name), '') <> ''
    """

    params = []

    normalized_place_type = normalize_text(place_type)
    normalized_cuisine = normalize_text(cuisine)
    kw_clean = normalize_keyword(keyword)

    if normalized_place_type in {"restaurant"}:
        sql += """
        AND LOWER(COALESCE(place_type, '')) = 'restaurant'
        """

    elif normalized_place_type in {"hotel", "accommodation", "hebergement", "hébergement"}:
        sql += """
        AND LOWER(COALESCE(place_type, '')) IN ('hotel', 'guest_house', 'motel', 'hostel')
        """

    if normalized_cuisine:
        sql += """
        AND COALESCE(LOWER(cuisine), '') NOT IN ('', 'unknown', 'none')
        AND LOWER(COALESCE(cuisine, '')) LIKE LOWER(?)
        """
        params.append(f"%{normalized_cuisine}%")

    if max_distance_km is not None:
        sql += """
        AND dist_to_center_km IS NOT NULL
        AND dist_to_center_km <= ?
        """
        params.append(max_distance_km)

    if min_rating is not None:
        sql += """
        AND google_rating IS NOT NULL
        AND google_rating >= ?
        """
        params.append(min_rating)

    if kw_clean:
        # Si le mot-clé désigne seulement le centre-ville,
        # on laisse surtout dist_to_center_km faire le travail.
        if kw_clean not in GENERIC_CENTER_TERMS:
            sql += """
            AND (
                LOWER(COALESCE(name, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(cuisine, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(address, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(addr_city, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(text, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(amenity, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(tourism, '')) LIKE LOWER(?)
            )
            """
            kw = f"%{kw_clean}%"
            params.extend([kw, kw, kw, kw, kw, kw, kw])

    if max_distance_km is not None:
        sql += """
        ORDER BY
            CASE WHEN dist_to_center_km IS NULL THEN 1 ELSE 0 END,
            dist_to_center_km ASC,
            CASE WHEN google_rating IS NULL THEN 1 ELSE 0 END,
            google_rating DESC
        LIMIT ?
        """
    else:
        sql += """
        ORDER BY
            CASE WHEN google_rating IS NULL THEN 1 ELSE 0 END,
            google_rating DESC,
            CASE WHEN dist_to_center_km IS NULL THEN 1 ELSE 0 END,
            dist_to_center_km ASC
        LIMIT ?
        """

    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [row_to_place_dict(row) for row in rows]


def get_place_details(internal_id):
    sql = """
    SELECT
        rowid AS internal_id,
        *
    FROM places
    WHERE rowid = ?
    """

    with get_connection() as conn:
        row = conn.execute(sql, [internal_id]).fetchone()

    if row is None:
        return None

    return row_to_place_dict(row)