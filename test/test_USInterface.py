import sys
from pathlib import Path

# Add project root to PYTHONPATH
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

import pandas as pd
from interface.us_macro_interface import USMacroInterface
from core.macro.US.US_data_preprocessor import USDataPreprocessor


def test_us_interface(monkeypatch):
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

    ui = USMacroInterface(data_root="data")
    result = ui.run()

    assert "score" in result
    assert "regime" in result
    assert "signal" in result
