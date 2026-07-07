import requests
from .BaseFetcher import BaseFetcher


class PMI_Fetcher(BaseFetcher):
    def __init__(self, country: str):
        super().__init__(country, "pmi")

    def fetch_pmi(self):
        # سری صحیح PMI آمریکا در DBnomics
        url = "https://api.db.nomics.world/v22/series/ISM/pmi/pm?observations=true"

        r = requests.get(url).json()

        # بررسی ساختار سری
        if "series" not in r or "docs" not in r["series"]:
            raise ValueError("DBnomics: سری PMI پیدا نشد.")

        docs = r["series"]["docs"]
        if not docs:
            raise ValueError("DBnomics: سری PMI هیچ داده‌ای ندارد.")

        doc = docs[0]

        periods = doc.get("period", [])
        values = doc.get("value", [])

        if not periods or not values:
            raise ValueError("DBnomics: دادهٔ معتبر برای PMI موجود نیست.")

        # تبدیل به ساختار period → value
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

    def update(self):
        return super().update(self.fetch_pmi)
