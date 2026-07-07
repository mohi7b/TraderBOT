import pandas as pd
from core.macro.US.US_score_calculator import USScoreCalculator


def test_us_score_calculator():
    df = pd.DataFrame({
        "norm_fedfunds": [0.2, 0.4],
        "norm_cpi": [0.3, 0.5],
    })
    weights = {
        "norm_fedfunds": 0.5,
        "norm_cpi": 0.5,
    }
    scorer = USScoreCalculator(weights=weights)
    out = scorer.compute_score_series(df, score_column="us_macro_score")

    assert "us_macro_score" in out.columns
    assert len(out["us_macro_score"]) == len(df)
