from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
from pathlib import Path
import math

# ---- Config ----
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "data" / "processed" / "citytaste_ottawa.db"

app = FastAPI(title="CityTaste API", version="0.1.0")


# ---- Utils ----
def get_conn():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"DB introuvable: {DB_PATH}")
    return sqlite3.connect(DB_PATH)

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


# ---- Schemas ----
class PlaceOut(BaseModel):
    osm_id: int
    osm_type: str
    name: Optional[str] = None
    place_type: str
    cuisine: Optional[str] = None
    lat: float
    lon: float
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None
    distance_km: Optional[float] = None
    score: Optional[float] = None
    explanation: Optional[str] = None


# ---- Routes ----
@app.get("/health")
def health():
    return {"status": "ok", "db_path": str(DB_PATH)}


@app.get("/place/{osm_type}/{osm_id}", response_model=PlaceOut)
def get_place(osm_type: str, osm_id: int):
    osm_type = osm_type.strip().lower()
    con = get_conn()
    cur = con.cursor()

    row = cur.execute("""
        SELECT osm_type, osm_id, name, place_type, cuisine, lat, lon, address, phone, website, opening_hours
        FROM places
        WHERE osm_type = ? AND osm_id = ?
        LIMIT 1;
    """, (osm_type, osm_id)).fetchone()

    con.close()

    if not row:
        raise HTTPException(status_code=404, detail="Place not found")

    return PlaceOut(
        osm_type=row[0],
        osm_id=row[1],
        name=row[2],
        place_type=row[3],
        cuisine=row[4],
        lat=row[5],
        lon=row[6],
        address=row[7],
        phone=row[8],
        website=row[9],
        opening_hours=row[10],
    )


@app.get("/search", response_model=List[PlaceOut])
def search(
    q: str = Query(..., min_length=2, description="Recherche par nom ou adresse"),
    limit: int = Query(20, ge=1, le=100)
):
    con = get_conn()
    cur = con.cursor()

    like = f"%{q.strip().lower()}%"
    rows = cur.execute("""
        SELECT osm_type, osm_id, name, place_type, cuisine, lat, lon, address, phone, website, opening_hours
        FROM places
        WHERE lower(coalesce(name,'')) LIKE ?
           OR lower(coalesce(address,'')) LIKE ?
        LIMIT ?;
    """, (like, like, limit)).fetchall()

    con.close()

    out = []
    for r in rows:
        out.append(PlaceOut(
            osm_type=r[0],
            osm_id=r[1],
            name=r[2],
            place_type=r[3],
            cuisine=r[4],
            lat=r[5],
            lon=r[6],
            address=r[7],
            phone=r[8],
            website=r[9],
            opening_hours=r[10],
        ))
    return out


@app.get("/recommend", response_model=List[PlaceOut])
def recommend(
    user_lat: float = Query(..., description="Latitude utilisateur"),
    user_lon: float = Query(..., description="Longitude utilisateur"),
    place_type: str = Query("restaurant", description="restaurant | hotel | motel | guest_house | hostel"),
    cuisine: Optional[str] = Query(None, description="Ex: italian, sushi"),
    radius_km: float = Query(5.0, gt=0, le=50),
    top_k: int = Query(10, ge=1, le=50)
):
    place_type = place_type.strip().lower()
    cuisine_norm = cuisine.strip().lower() if cuisine else None

    con = get_conn()
    cur = con.cursor()

    rows = cur.execute("""
        SELECT osm_type, osm_id, name, place_type, cuisine, lat, lon, address, phone, website, opening_hours
        FROM places
        WHERE place_type = ?;
    """, (place_type,)).fetchall()

    con.close()

    scored = []
    for r in rows:
        lat, lon = r[5], r[6]
        dist = haversine_km(user_lat, user_lon, lat, lon)
        if dist > radius_km:
            continue

        # simple cuisine match
        cuisine_match = 0
        if cuisine_norm and r[4]:
            cuisines = str(r[4]).lower().split(";")
            cuisine_match = 1 if cuisine_norm in [c.strip() for c in cuisines] else 0

        # info completeness
        has_website = 1 if r[9] else 0
        has_phone = 1 if r[8] else 0
        has_opening = 1 if r[10] else 0
        info_score = (has_website + has_phone + has_opening) / 3.0

        distance_score = 1 / (1 + dist)

        final_score = 0.60 * distance_score + 0.25 * cuisine_match + 0.15 * info_score

        why = []
        why.append(f"proche ({dist:.1f} km)")
        if cuisine_match == 1:
            why.append(f"cuisine match ({cuisine_norm})")
        if info_score >= 0.67:
            why.append("infos complètes (site/tél/horaires)")
        explanation = " + ".join(why)

        scored.append((final_score, dist, r, explanation))

    scored.sort(key=lambda x: x[0], reverse=True)
    scored = scored[:top_k]

    out = []
    for score, dist, r, explanation in scored:
        out.append(PlaceOut(
            osm_type=r[0],
            osm_id=r[1],
            name=r[2],
            place_type=r[3],
            cuisine=r[4],
            lat=r[5],
            lon=r[6],
            address=r[7],
            phone=r[8],
            website=r[9],
            opening_hours=r[10],
            distance_km=round(dist, 3),
            score=round(score, 6),
            explanation=explanation
        ))

    return out