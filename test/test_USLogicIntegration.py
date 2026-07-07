import pandas as pd
from pathlib import Path

from core.macro.US.US_aggregator import USMacroAggregator
from core.logic.US.US_regime_detector import USRegimeDetector
from core.logic.US.US_macro_interpreter import USMacroInterpreter
from core.logic.US.US_signal_generator import USSignalGenerator


def test_us_logic_integration(monkeypatch):
    """
    Full integration test:
    Core (score) → Logic (regime, interpretation, signal)
    """

    # -----------------------------
    # 1) Mock data for Core
    # -----------------------------
    df_mock = pd.DataFrame({
        "date": ["2024-01-01", "2024-02-01"],
        "fedfunds_rate": [5.0, 5.1],
        "cpi": [3.2, 3.3],
        "dgs10": [4.0, 4.1],
        "gdp": [2.5, 2.6],
    })

    def mock_preprocess(self):
        return {"data": df_mock}

    monkeypatch.setattr(
        "core.macro.US.data_preprocessor.USDataPreprocessor.preprocess",
        mock_preprocess
    )

    # -----------------------------
    # 2) Run Core Aggregator
    # -----------------------------
    agg = USMacroAggregator(data_root=Path("data"))
    df = agg.run()

    assert "us_macro_score" in df.columns
    latest_score = df["us_macro_score"].iloc[-1]

    # -----------------------------
    # 3) Run Logic Layer
    # -----------------------------
    detector = USRegimeDetector()
    regime = detector.detect(latest_score)

    interpreter = USMacroInterpreter()
    interpretation = interpreter.interpret(regime)

    signal_gen = USSignalGenerator()
    signal = signal_gen.generate(regime)

    # -----------------------------
    # 4) Assertions
    # -----------------------------
    assert isinstance(regime, str)
    assert isinstance(interpretation, str)
    assert isinstance(signal, dict)

    assert "risk" in signal
    assert "bias" in signal
    assert "allocation" in signal
