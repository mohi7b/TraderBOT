import json
import pandas as pd
from pathlib import Path


def convert_json_to_csv(json_path, csv_path, column_name):
    with open(json_path, "r") as f:
        data = json.load(f)

    # اگر JSON لیست بود
    if isinstance(data, list):
        df = pd.DataFrame(data)
        df = df.rename(columns={"value": column_name})
    else:
        # اگر JSON دیکشنری بود
        df = pd.DataFrame([
            {"date": k, column_name: v}
            for k, v in data.items()
        ])

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)
    print(f"Saved: {csv_path}")
