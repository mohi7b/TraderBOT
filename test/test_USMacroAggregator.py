import pandas as pd
from pathlib import Path
from core.macro.US.US_aggregator import USMacroAggregator

def test_us_macro_aggregator_run(monkeypatch):

    # ساخت داده تستی کامل و بدون NaN
    df_mock = pd.DataFrame({
        "date": ["2024-01-01", "2024-02-01"],
        "fedfunds_rate": [5.0, 5.1],
        "cpi": [3.2, 3.3],
        "dgs10": [4.0, 4.1],
        "gdp": [2.5, 2.6],
    })

    # جایگزین کردن preprocess با داده تستی
    def mock_preprocess(self):
        return {"data": df_mock}

    monkeypatch.setattr(
        "core.macro.US.data_preprocessor.USDataPreprocessor.preprocess",
        mock_preprocess
    )

    agg = USMacroAggregator(data_root=Path("data"))
    df = agg.run()

    assert "us_macro_score" in df.columns
    assert not df["us_macro_score"].isna().any()
