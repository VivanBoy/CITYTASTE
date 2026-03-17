"""
Pipeline script to run the full data processing workflow.
"""

from config import RAW_PATH, CLEAN_CSV_PATH, DB_PATH
import subprocess
import sys

def main():
    print("Starting CityTaste data pipeline...")

    # Check if raw data exists
    if not RAW_PATH.exists():
        print(f"Error: Raw data file not found at {RAW_PATH}")
        sys.exit(1)

    print(f"Raw data found: {RAW_PATH}")

    # Run data preparation
    print("Running data preparation...")
    try:
        subprocess.run([sys.executable, "src/data_prep.py"], check=True)
        print("Data preparation completed.")
    except subprocess.CalledProcessError as e:
        print(f"Error in data preparation: {e}")
        sys.exit(1)

    # Check if clean CSV was created
    if not CLEAN_CSV_PATH.exists():
        print(f"Error: Clean CSV not created at {CLEAN_CSV_PATH}")
        sys.exit(1)

    # Run database initialization
    print("Running database initialization...")
    try:
        subprocess.run([sys.executable, "src/db_init.py"], check=True)
        print("Database initialization completed.")
    except subprocess.CalledProcessError as e:
        print(f"Error in database initialization: {e}")
        sys.exit(1)

    # Check if DB was created
    if not DB_PATH.exists():
        print(f"Error: Database not created at {DB_PATH}")
        sys.exit(1)

    print("Pipeline completed successfully!")
    print(f"Clean data: {CLEAN_CSV_PATH}")
    print(f"Database: {DB_PATH}")

if __name__ == "__main__":
    main()