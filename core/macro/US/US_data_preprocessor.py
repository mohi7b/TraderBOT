import pandas as pd
from pathlib import Path
from typing import Dict, Any


class USDataPreprocessor:
    """
    Loads all standardized CSV macro series from:
    data/US/*.csv

    and merges them into a unified time-indexed DataFrame.
    """

    def __init__(self, data_root: Path):
        self.data_root = data_root

        # مسیر جدید و متمرکز CSVها
        self.base_path = self.data_root / "US"

        # تعریف مسیرهای جدید
        self.paths = {
            "interest_rate": self.base_path / "interest_rate.csv",
            "cpi": self.base_path / "cpi.csv",
            "pce": self.base_path / "pce.csv",
            "dgs2": self.base_path / "dgs2.csv",
            "dgs10": self.base_path / "dgs10.csv",
            "dxy": self.base_path / "dxy.csv",
            "unemployment": self.base_path / "unemployment_rate.csv",
            "gdp": self.base_path / "gdp.csv",
            "pmi_manu": self.base_path / "pmi_manu.csv",
            "pmi_services": self.base_path / "pmi_services.csv",
        }

    def load_csv(self, path: Path) -> pd.DataFrame:
        """Loads a CSV with required structure: date,value"""
        if not path.exists():
            raise FileNotFoundError(f"Missing required data file: {path}")

        df = pd.read_csv(path)
        df["date"] = pd.to_datetime(df["date"])
        return df

    def build_unified_frame(self) -> pd.DataFrame:
        """Merge all macro series into one DataFrame indexed by date."""
        frames = []

        for name, path in self.paths.items():
            df = self.load_csv(path)
            df = df.rename(columns={"value": name})
            frames.append(df)

        base = frames[0]
        for df in frames[1:]:
            base = base.merge(df, on="date", how="outer")

        base = base.sort_values("date").reset_index(drop=True)
        return base

    def preprocess(self) -> Dict[str, Any]:
        df = self.build_unified_frame()
        return {"data": df}
