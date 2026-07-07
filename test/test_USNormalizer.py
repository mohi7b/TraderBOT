import pandas as pd
from core.macro.US.US_normalizer import USNormalizer


def test_us_normalizer_minmax():
    df = pd.DataFrame({"cpi": [1.0, 2.0, 3.0]})
    norm = USNormalizer(method="minmax")
    out = norm.normalize_frame(df, {"cpi": "norm_cpi"})
    assert "norm_cpi" in out.columns
    assert out["norm_cpi"].min() == 0.0
    assert out["norm_cpi"].max() == 1.0
