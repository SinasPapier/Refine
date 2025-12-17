import os
import json 
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "refine.json"


def ensure_data_file():
    if not DATA_FILE.exists():
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "goals": []
                },
                f,
                indent=4
            )