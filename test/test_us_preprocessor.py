from pathlib import Path
from core.macro.US.US_data_preprocessor import USDataPreprocessor


def test_us_preprocessor_build_unified_frame():
    data_root = Path("data")
    prep = USDataPreprocessor(data_root=data_root)
    result = prep.preprocess()
    df = result["data"]

    assert not df.empty
    assert "date" in df.columns
