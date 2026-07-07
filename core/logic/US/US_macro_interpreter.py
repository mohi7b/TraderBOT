from pathlib import Path
import json


class USMacroInterpreter:
    """
    Converts regime labels into human-readable macroeconomic interpretations.
    Saves interpretation into logic_output/interpretation.json
    """

    def __init__(self):
        # مسیر خروجی لایهٔ لوجیکال
        self.output_root = Path(__file__).parent / "logic_output"
        self.output_root.mkdir(exist_ok=True)

        # Interpretation text for each regime
        self.mapping = {
            "early_expansion": (
                "The US economy is in early expansion. Growth momentum is improving, "
                "business activity is picking up, and leading indicators are turning positive."
            ),
            "mid_expansion": (
                "The US economy is in mid expansion. Growth is stable, labor markets are healthy, "
                "and macro conditions support continued economic strength."
            ),
            "late_expansion": (
                "The US economy is in late expansion. Growth remains positive but is showing signs "
                "of deceleration. Inflation pressures or tightening conditions may be emerging."
            ),
            "slowdown": (
                "The US economy is slowing down. Key indicators are weakening, momentum is fading, "
                "and caution is warranted as risks begin to rise."
            ),
            "contraction": (
                "The US economy is contracting. Macro conditions are deteriorating, business activity "
                "is weakening, and recession risks are elevated."
            ),
            "unknown": (
                "The economic regime cannot be determined due to insufficient or inconsistent data."
            )
        }

    def interpret(self, regime: str) -> str:
        """
        Convert regime label into human-readable explanation.
        Also saves the output to JSON.
        """
        interpretation = self.mapping.get(regime, "Unknown regime")
        self._save(interpretation)
        return interpretation

    def _save(self, interpretation: str):
        """Save interpretation output to JSON file."""
        out_path = self.output_root / "interpretation.json"
        with open(out_path, "w") as f:
            json.dump({"interpretation": interpretation}, f, indent=4)
