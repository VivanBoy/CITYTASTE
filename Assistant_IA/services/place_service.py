from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "citytaste_ottawa.db"


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

    if place_type == "restaurant":
        sql += """
        AND LOWER(COALESCE(place_type, '')) = 'restaurant'
        """

    elif place_type == "hotel":
        sql += """
        AND LOWER(COALESCE(place_type, '')) IN ('hotel', 'guest_house', 'motel', 'hostel')
        """

    if cuisine:
        sql += """
        AND COALESCE(LOWER(cuisine), '') NOT IN ('', 'unknown', 'none')
        AND LOWER(COALESCE(cuisine, '')) LIKE LOWER(?)
        """
        params.append(f"%{cuisine}%")

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

    if keyword:
        kw_clean = keyword.lower().strip()

        generic_center_terms = {
            "downtown",
            "centre",
            "center",
            "centre ottawa",
            "center ottawa",
            "centre-ville",
            "centreville",
            "centre ville",
            "downtown ottawa"
    }

    # Si le mot-clé désigne simplement le centre,
    # on laisse dist_to_center_km faire le travail.
    if kw_clean not in generic_center_terms:
        sql += """
        AND (
            LOWER(COALESCE(name, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(cuisine, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(address, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(text, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(amenity, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(tourism, '')) LIKE LOWER(?)
        )
        """
        kw = f"%{kw_clean}%"
        params.extend([kw, kw, kw, kw, kw, kw])

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