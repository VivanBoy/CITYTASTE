from src.recommender import recommend

# Exemple: centre-ville Ottawa (approx)
res = recommend(
    user_lat=45.4215,
    user_lon=-75.6972,
    place_type="restaurant",
    cuisine="italian",
    radius_km=3,
    top_k=10
)

print(res)