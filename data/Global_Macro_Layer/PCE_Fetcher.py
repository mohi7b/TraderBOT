
from config.api_keys import FRED_API_KEY

from .BaseFetcher import BaseFetcher

class PCE_Fetcher(BaseFetcher):
    def __init__(self, country: str = "US"):
        super().__init__(country, "pce")

    def fetch_pce(self):
        api_key = FRED_API_KEY
        series_id = "PCEPI"   # Personal Consumption Expenditures Price Index

        return self.fetch_fred(api_key, series_id)

    def update(self):
        return super().update(self.fetch_pce)
