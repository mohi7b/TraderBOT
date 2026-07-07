import pandas as pd
from pathlib import Path

from core.logic.US.US_macro_pipeline import USMacroPipeline


def test_us_macro_pipeline(monkeypatch):
    # Mock data for core
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

    pipeline = USMacroPipeline(data_root=Path("data"))
    result = pipeline.run()

    assert "score" in result
    assert "regime" in result
    assert "interpretation" in result
    assert "signal" in result
    assert isinstance(result["signal"], dict)
