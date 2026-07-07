import pandas as pd
from core.macro.US.US_validator import USDataValidator


def test_us_validator_ok():
    df = pd.DataFrame({
        "date": ["2024-01-01", "2024-02-01"],
        "cpi": [3.1, 3.2],
    })
    v = USDataValidator(required_columns=["date", "cpi"])
    v.validate(df)  # نباید خطا بده


def test_us_validator_missing_column():
    df = pd.DataFrame({"date": ["2024-01-01"]})
    v = USDataValidator(required_columns=["date", "cpi"])
    try:
        v.validate(df)
        assert False, "Expected ValueError for missing column"
    except ValueError:
        assert True
