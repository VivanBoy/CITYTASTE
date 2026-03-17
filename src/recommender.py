import pandas as pd
import math
from config import CLEAN_CSV_PATH

DATA_PATH = CLEAN_CSV_PATH

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def recommend(
    user_lat: float,
    user_lon: float,
    place_type: str = "restaurant",
    cuisine: str | None = None,
    radius_km: float = 5.0,
    top_k: int = 10,
):
    df = pd.read_csv(DATA_PATH)

    place_type = place_type.strip().lower()
    df = df[df["place_type"] == place_type].copy()

    # distance
    df["distance_km"] = df.apply(lambda r: haversine_km(user_lat, user_lon, r["lat"], r["lon"]), axis=1)
    df = df[df["distance_km"] <= radius_km].copy()

    # cuisine match (si l’utilisateur en donne une)
    if cuisine:
        cuisine = cuisine.strip().lower()
        df["cuisine_match"] = df["cuisine_list"].fillna("[]").astype(str).str.contains(cuisine)
        cuisine_score = df["cuisine_match"].astype(int)
    else:
        cuisine_score = 0

    # score = proximité + match cuisine + complétude
    # (simple et efficace pour MVP)
    # distance_score: plus proche = plus grand score
    df["distance_score"] = 1 / (1 + df["distance_km"])  # 0..1+
    df["info_score_norm"] = df["info_score"] / 3.0      # 0..1

    df["final_score"] = (
        0.60 * df["distance_score"]
        + 0.25 * (cuisine_score if isinstance(cuisine_score, pd.Series) else 0)
        + 0.15 * df["info_score_norm"]
    )

    df = df.sort_values("final_score", ascending=False).head(top_k)

    cols = ["name", "place_type", "cuisine", "distance_km", "address", "website", "final_score"]
    return df[cols]