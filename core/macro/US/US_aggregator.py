from pathlib import Path
from typing import Dict, Any
import pandas as pd

from config.US_macro_config import (
    NORMALIZATION_METHOD,
    REQUIRED_COLUMNS,
    WEIGHTS,
    NORMALIZED_COLUMNS,
)

from .US_data_preprocessor import USDataPreprocessor
from .US_validator import USDataValidator
from .US_normalizer import USNormalizer
from .US_score_calculator import USScoreCalculator


class USMacroAggregator:
    """
    Core US macro pipeline:
    1) Preprocess raw CSV data
    2) Validate required columns
    3) Normalize selected columns
    4) Compute weighted macro score
    5) Save processed outputs into macro_output/
    """

    def __init__(self, data_root: Path):
        self.data_root = data_root

        # مسیر خروجی‌های Core
        self.output_root = Path(__file__).parent / "macro_output"
        self.output_root.mkdir(exist_ok=True)

        # اجزای هسته
        self.preprocessor = USDataPreprocessor(data_root=self.data_root)
        self.validator = USDataValidator(required_columns=REQUIRED_COLUMNS)
        self.normalizer = USNormalizer(method=NORMALIZATION_METHOD)
        self.scorer = USScoreCalculator(weights=WEIGHTS)

    def run(self) -> pd.DataFrame:
        # 1) Load & preprocess
        prep_result: Dict[str, Any] = self.preprocessor.preprocess()
        df: pd.DataFrame = prep_result["data"]

        # 2) Validate required columns exist
        self.validator.validate(df)

        # 3) Normalize selected columns
        df_norm = self.normalizer.normalize_frame(df, columns=NORMALIZED_COLUMNS)

        # ذخیره نرمال‌سازی
        df_norm.to_csv(self.output_root / "normalized.csv", index=False)

        # 4) Compute macro score
        df_scored = self.scorer.compute_score_series(
            df_norm,
            score_column="us_macro_score"
        )

        # ذخیره خروجی نهایی هسته
        df_scored.to_csv(self.output_root / "aggregated_scored.csv", index=False)

        return df_scored
