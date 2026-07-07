from config.US_logic_config import SIGNAL_RULES
from pathlib import Path
import json


class USSignalGenerator:
    """
    Generates portfolio/trading signals based on detected macro regime.
    Saves output into logic_output/signal.json
    """

    def __init__(self, rules: dict = None):
        self.rules = rules or SIGNAL_RULES

        # مسیر خروجی لایهٔ لوجیکال
        self.output_root = Path(__file__).parent / "logic_output"
        self.output_root.mkdir(exist_ok=True)

    def generate(self, regime: str) -> dict:
        """
        Returns a dict with:
        - risk: low / medium / high
        - bias: bullish / neutral / bearish
        - allocation: suggested portfolio tilt
        """

        default_signal = {
            "risk": "unknown",
            "bias": "unknown",
            "allocation": "unknown"
        }

        if regime is None:
            signal = default_signal
            self._save(signal)
            return signal

        signal = self.rules.get(regime, default_signal)
        self._save(signal)
        return signal

    def _save(self, signal: dict):
        """Save signal output to JSON file."""
        out_path = self.output_root / "signal.json"
        with open(out_path, "w") as f:
            json.dump(signal, f, indent=4)
