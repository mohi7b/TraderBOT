"""
Main configuration for US macro logic layer.
Loads regime and signal rules from JSON files.
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


# Regime detection rules
REGIME_RULES = load_json("US_regime_rules.json")

# Signal generation rules
SIGNAL_RULES = load_json("US_signal_rules.json")
