import pandas as pd
from config import RAW_PATH, CLEAN_CSV_PATH

def main():
    if not RAW_PATH.exists():
        raise FileNotFoundError(f"Fichier introuvable: {RAW_PATH}")

    df = pd.read_csv(RAW_PATH)

    print("Shape:", df.shape)
    print("\nColonnes:", list(df.columns))
    print("\nAperçu:")
    print(df.head(5))
    print("\nValeurs manquantes (%):")
    print((df.isna().mean() * 100).round(1).sort_values(ascending=False).head(10))

    # 1) enlever doublons OSM (id unique attendu)
    df = df.drop_duplicates(subset=["osm_id"]).copy()

    # 2) forcer types numériques
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")

    # 3) supprimer lignes sans coordonnées (on ne peut pas calculer distance)
    df = df.dropna(subset=["lat", "lon"]).copy()

    # 4) normaliser place_type (restaurant vs hébergement)
    df["place_type"] = df["place_type"].fillna("other").str.lower().str.strip()

    # 5) garder seulement ce qui nous intéresse (MVP)
    allowed = {"restaurant", "hotel", "motel", "guest_house", "hostel"}
    df = df[df["place_type"].isin(allowed)].copy()

    print("Après nettoyage:", df.shape)
    print(df["place_type"].value_counts())

    def normalize_text(x):
        if pd.isna(x):
            return ""
        return str(x).strip().lower()

    # Cuisine -> liste (OSM met souvent "italian;pizza")
    df["cuisine_norm"] = df["cuisine"].apply(normalize_text)
    df["cuisine_list"] = df["cuisine_norm"].apply(lambda s: [c.strip() for c in s.split(";") if c.strip()])

    # Adresse (déjà une colonne "address" dans ton CSV)
    df["address_norm"] = df["address"].apply(normalize_text)

    # Complétude infos (bonus pour recommander des fiches "utiles")
    df["has_website"] = df["website"].notna() & (df["website"].astype(str).str.strip() != "")
    df["has_phone"] = df["phone"].notna() & (df["phone"].astype(str).str.strip() != "")
    df["has_opening_hours"] = df["opening_hours"].notna() & (df["opening_hours"].astype(str).str.strip() != "")

    df["info_score"] = (
        df["has_website"].astype(int)
        + df["has_phone"].astype(int)
        + df["has_opening_hours"].astype(int)
    )

    print(df[["name","place_type","cuisine","info_score","address"]].head(10))

    df.to_csv(CLEAN_CSV_PATH, index=False)
    print("Sauvegardé:", CLEAN_CSV_PATH)

if __name__ == "__main__":
    main()