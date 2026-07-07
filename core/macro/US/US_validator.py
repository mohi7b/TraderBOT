import pandas as pd
from typing import List


class USDataValidator:
    """
    Validates structural integrity of US macro data:
    - Required columns exist
    - NaN ratios are acceptable
    - Basic structural sanity checks
    """

    def __init__(self, required_columns: List[str] | None = None,
                 max_nan_ratio: float = 0.3):
        self.required_columns = required_columns or ["date"]
        self.max_nan_ratio = max_nan_ratio

    def check_required_columns(self, df: pd.DataFrame) -> None:
        missing = [c for c in self.required_columns if c not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

    def check_nan_ratio(self, df: pd.DataFrame) -> None:
        nan_ratio = df.isna().mean()
        bad_cols = nan_ratio[nan_ratio > self.max_nan_ratio].index.tolist()
        if bad_cols:
            raise ValueError(
                f"Too many NaNs in columns (>{self.max_nan_ratio*100:.0f}%): {bad_cols}"
            )

    def check_date_integrity(self, df: pd.DataFrame) -> None:
        if "date" not in df.columns:
            raise ValueError("Missing 'date' column")

        if df["date"].isna().any():
            raise ValueError("Date column contains NaN values")

        if not pd.api.types.is_datetime64_any_dtype(df["date"]):
            raise ValueError("Date column must be datetime type")

    def validate(self, df: pd.DataFrame) -> None:
        self.check_required_columns(df)
        self.check_date_integrity(df)
        self.check_nan_ratio(df)
