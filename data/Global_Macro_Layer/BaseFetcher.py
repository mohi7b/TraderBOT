import requests
import json
from pathlib import Path
import json
import os


class BaseFetcher:
    def __init__(self, country: str, indicator: str):
        self.country = country.upper()
        self.indicator = indicator.lower()

        self.output_dir = Path(f"data/{self.country}")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.history_file = self.output_dir / f"{self.indicator}_history.json"
        self.latest_file = self.output_dir / f"{self.indicator}_latest.json"
        self.csv_file = self.output_dir / f"{self.indicator}.csv"

    def fetch_fred(self, api_key: str, series_id: str):
        url = (
            "https://api.stlouisfed.org/fred/series/observations"
            f"?series_id={series_id}&api_key={api_key}&file_type=json"
        )

        r = requests.get(url).json()

        if "observations" not in r:
            raise ValueError("FRED: داده‌ای دریافت نشد.")

        series_data = {}
        for obs in r["observations"]:
            date = obs["date"]
            value = obs["value"]
            try:
                value = float(value)
            except:
                continue
            series_data[date] = value

        return series_data

    def fetch_dbnomics(self, provider: str, dataset: str, series: str):
        url = f"https://api.db.nomics.world/v22/series/{provider}/{dataset}/{series}?observations=true"

        r = requests.get(url).json()

        if "series" not in r or "docs" not in r["series"]:
            raise ValueError(f"DBnomics: سری '{provider}/{dataset}/{series}' پیدا نشد.")

        docs = r["series"]["docs"]
        if len(docs) == 0:
            raise ValueError(f"DBnomics: سری '{provider}/{dataset}/{series}' هیچ داده‌ای ندارد.")

        doc = docs[0]

        periods = doc.get("period", [])
        values = doc.get("value", [])

        if not periods or not values:
            raise ValueError(f"DBnomics: سری '{provider}/{dataset}/{series}' دادهٔ معتبر ندارد.")

        series_data = {}
        for date, value in zip(periods, values):
            if value is None:
                continue
            try:
                value = float(value)
            except:
                continue
            series_data[date] = value

        return series_data

    def save_history(self, series_data):
        sorted_dates = sorted(series_data.keys())
        latest_date = sorted_dates[-1]
        latest_value = series_data[latest_date]

        if self.history_file.exists():
            with open(self.history_file, "r") as f:
                history = json.load(f)
        else:
            history = []

        if history and history[-1]["value"] == latest_value:
            return False

        history.append({"date": latest_date, "value": latest_value})

        with open(self.history_file, "w") as f:
            json.dump(history, f, indent=4)

        return True

    def save_latest(self, series_data):
        sorted_dates = sorted(series_data.keys())
        latest_date = sorted_dates[-1]
        latest_value = series_data[latest_date]

        with open(self.latest_file, "w") as f:
            json.dump({"date": latest_date, "value": latest_value}, f, indent=4)

    def save_csv(self):
        if not self.history_file.exists():
            return

        with open(self.history_file, "r") as f:
            history = json.load(f)

        with open(self.csv_file, "w") as f:
            f.write("date,value\n")
            for item in history:
                f.write(f"{item['date']},{item['value']}\n")

    def update(self, fetch_method):
        try:
            series_data = fetch_method()
        except Exception as e:
            raise ValueError(f"خطا در دریافت داده: {e}")

        updated = self.save_history(series_data)
        self.save_latest(series_data)
        self.save_csv()

        return updated
    
    def load_latest(self):
        """Load the latest value from latest.json"""
        latest_path = f"data/{self.country}/{self.indicator}_latest.json"

        if not os.path.exists(latest_path):
            raise FileNotFoundError(f"Latest file not found: {latest_path}")

        with open(latest_path, "r") as f:
            return json.load(f)

    def load_history(self):
        """Load full history from history.json"""
        history_path = f"data/{self.country}/{self.indicator}_history.json"

        if not os.path.exists(history_path):
            raise FileNotFoundError(f"History file not found: {history_path}")

        with open(history_path, "r") as f:
            return json.load(f)
