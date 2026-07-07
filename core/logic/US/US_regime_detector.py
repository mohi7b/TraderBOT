from config.US_logic_config import REGIME_RULES
from pathlib import Path
import json
import math


class USRegimeDetector:
    """
    Determines the economic regime based on macro score.
    Saves regime output into logic_output/regime.json
    """

    def __init__(self, rules: dict = None):
        self.rules = rules or REGIME_RULES

        # مسیر خروجی لایهٔ لوجیکال
        self.output_root = Path(__file__).parent / "logic_output"
        self.output_root.mkdir(exist_ok=True)

    def detect(self, score: float) -> str:
        # Handle missing or invalid score
        if score is None or (isinstance(score, float) and math.isnan(score)):
            regime = "unknown"
            self._save(regime)
            return regime

        # Iterate through configured ranges
        for regime, bounds in self.rules.items():
            min_s = bounds.get("min_score", float("-inf"))
            max_s = bounds.get("max_score", float("inf"))

            if min_s <= score <= max_s:
                self._save(regime)
                return regime

        # Fallback
        regime = "unknown"
        self._save(regime)
        return regime

    def _save(self, regime: str):
        """Save regime output to JSON file."""
        out_path = self.output_root / "regime.json"
        with open(out_path, "w") as f:
            json.dump({"regime": regime}, f, indent=4)
