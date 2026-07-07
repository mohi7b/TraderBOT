import pandas as pd
from typing import Literal, Dict


class USNormalizer:
    """
    Pure math normalization:
    - Min-Max
    - Z-Score
    - Rank-based
    Config decides which method to use.
    """

    def __init__(self, method: Literal["minmax", "zscore", "rank"] = "minmax"):
        self.method = method

    def _minmax(self, series: pd.Series) -> pd.Series:
        s = series.astype(float)
        min_val = s.min()
        max_val = s.max()
        if pd.isna(min_val) or pd.isna(max_val) or max_val == min_val:
            return pd.Series([0.0] * len(s), index=s.index)
        return (s - min_val) / (max_val - min_val)

    def _zscore(self, series: pd.Series) -> pd.Series:
        s = series.astype(float)
        mean = s.mean()
        std = s.std()
        if std == 0 or pd.isna(std):
            return pd.Series([0.0] * len(s), index=s.index)
        return (s - mean) / std

    def _rank(self, series: pd.Series) -> pd.Series:
        s = series.astype(float)
        return s.rank(method="average") / len(s)

    def normalize_frame(self, df: pd.DataFrame,
                        columns: Dict[str, str]) -> pd.DataFrame:
        """
        columns: mapping {raw_column_name: normalized_column_name}
        """
        out = df.copy()

        for raw_col, norm_col in columns.items():
            if raw_col not in out.columns:
                continue

            s = out[raw_col]

            # Handle missing values safely
            if s.isna().all():
                out[norm_col] = 0.0
                continue

            if self.method == "minmax":
                out[norm_col] = self._minmax(s)
            elif self.method == "zscore":
                out[norm_col] = self._zscore(s)
            elif self.method == "rank":
                out[norm_col] = self._rank(s)
            else:
                raise ValueError(f"Unknown normalization method: {self.method}")

        return out
