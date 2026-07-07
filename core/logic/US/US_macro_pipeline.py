from pathlib import Path

from core.macro.US.US_aggregator import USMacroAggregator
from core.logic.US.US_regime_detector import USRegimeDetector
from core.logic.US.US_macro_interpreter import USMacroInterpreter
from core.logic.US.US_signal_generator import USSignalGenerator


class USMacroPipeline:
    """
    Full pipeline:
    Core (score) → Logic (regime, interpretation, signal)
    Returns a clean JSON-like dict for UI or API.
    """

    def __init__(self, data_root: Path):
        self.data_root = data_root

        self.aggregator = USMacroAggregator(data_root=self.data_root)
        self.detector = USRegimeDetector()
        self.interpreter = USMacroInterpreter()
        self.signal_gen = USSignalGenerator()

    def run(self) -> dict:
        # 1) Run core scoring
        df = self.aggregator.run()

        if df.empty:
            return {
                "date": None,
                "score": None,
                "regime": "unknown",
                "interpretation": "No macro data available.",
                "signal": {
                    "risk": "unknown",
                    "bias": "unknown",
                    "allocation": "unknown"
                }
            }

        latest_row = df.iloc[-1]

        score = float(latest_row.get("us_macro_score", 0.0))
        date = latest_row.get("date")

        # 2) Detect regime
        regime = self.detector.detect(score)

        # 3) Human interpretation
        interpretation = self.interpreter.interpret(regime)

        # 4) Generate signal
        signal = self.signal_gen.generate(regime)

        # 5) Final JSON output
        return {
            "date": str(date),
            "score": score,
            "regime": regime,
            "interpretation": interpretation,
            "signal": signal
        }
