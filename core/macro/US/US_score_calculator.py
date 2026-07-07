import pandas as pd
from typing import Dict


class USScoreCalculator:
    """
    Pure math scoring:
    - Takes normalized columns
    - Applies weights from config
    - Produces a single score per row (e.g., per date)
    """

    def __init__(self, weights: Dict[str, float]):
        """
        weights: {normalized_column_name: weight}
        """
        self.weights = weights

    def compute_score_series(self, df: pd.DataFrame,
                             score_column: str = "us_macro_score") -> pd.DataFrame:
        # Check missing columns
        missing = [col for col in self.weights.keys() if col not in df.columns]
        if missing:
            raise ValueError(f"Missing normalized columns for scoring: {missing}")

        # Start score at zero
        score = pd.Series(0.0, index=df.index)

        # Weighted sum
        for col, w in self.weights.items():
            series = df[col].astype(float).fillna(0.0)
            score += series * w

        out = df.copy()
        out[score_column] = score

        return out
