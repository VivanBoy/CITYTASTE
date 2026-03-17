import sqlite3
from config import DB_PATH

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# 10 restaurants au hasard
rows = cur.execute("""
SELECT name, address, cuisine, website
FROM places
WHERE place_type = 'restaurant'
LIMIT 10;
""").fetchall()

con.close()

for r in rows:
    print(r)
