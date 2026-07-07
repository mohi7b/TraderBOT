"""
Main configuration file for US macro scoring system.
All parameters here are editable without touching core code.
"""

from pathlib import Path
import json


CONFIG_ROOT = Path(__file__).parent


def load_json(name: str):
    path = CONFIG_ROOT / name

    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    try:
        with open(path, "r") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in config file {path}: {e}")


# -----------------------------
# Normalization method
# -----------------------------
NORMALIZATION_METHOD = "minmax"   # options: minmax, zscore, rank


# -----------------------------
# Required columns for validator
# -----------------------------
REQUIRED_COLUMNS = ["date"]


# -----------------------------
# Load dynamic configs
# -----------------------------
WEIGHTS = load_json("US_macro_weights.json")
NORMALIZED_COLUMNS = load_json("US_macro_columns.json")
THRESHOLDS = load_json("US_macro_thresholds.json")
