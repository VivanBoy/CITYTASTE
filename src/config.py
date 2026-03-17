"""
Configuration and constants for CityTaste project.
"""

from pathlib import Path

# Project root: directory containing /data
PROJECT_ROOT = Path.cwd()

# Data paths
RAW_PATH = PROJECT_ROOT / "data" / "raw" / "ottawa_places_from_osm.csv"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

CLEAN_CSV_PATH = PROCESSED_DIR / "ottawa_places_clean.csv"
DB_PATH = PROCESSED_DIR / "citytaste_ottawa.db"

# Common imports (can be imported where needed)
# import pandas as pd
# import numpy as np
# import sqlite3
# import math
# import matplotlib.pyplot as plt</content>
<parameter name="filePath">c:\Users\Innocent\OneDrive\Bureau\@ProgrammeAI_cours_session_04\Projet Capstone en IA\CityTaste\src\config.py