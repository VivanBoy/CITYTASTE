import pandas as pd
import sqlite3
from config import CLEAN_CSV_PATH, DB_PATH

def main():
    if not CLEAN_CSV_PATH.exists():
        raise FileNotFoundError(f"CSV introuvable: {CLEAN_CSV_PATH}")

    df = pd.read_csv(CLEAN_CSV_PATH)

    # Recréer la DB proprement
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = sqlite3.connect(DB_PATH)
    df.to_sql("places", con, index=False, if_exists="replace")

    # Index pour accélérer filtres/tri
    cur = con.cursor()
    cur.execute("CREATE INDEX IF NOT EXISTS idx_places_type ON places(place_type);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_places_name ON places(name);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_places_lat_lon ON places(lat, lon);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_places_cuisine ON places(cuisine);")

    con.commit()

    # Vérifications
    total = cur.execute("SELECT COUNT(*) FROM places;").fetchone()[0]
    by_type = cur.execute("""
        SELECT place_type, COUNT(*) 
        FROM places 
        GROUP BY place_type
        ORDER BY COUNT(*) DESC;
    """).fetchall()

    con.close()

    print("DB créée:", DB_PATH)
    print("Total rows:", total)
    print("Répartition place_type:", by_type)

if __name__ == "__main__":
    main()