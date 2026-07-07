
from config.api_keys import FRED_API_KEY

from .BaseFetcher import BaseFetcher

class Unemployment_Fetcher(BaseFetcher):
    def __init__(self, country: str = "US"):
        super().__init__(country, "unemployment")

    def fetch_unemployment(self):
        api_key = FRED_API_KEY
        series_id = "UNRATE"   # Unemployment Rate (FRED)

        return self.fetch_fred(api_key, series_id)

    def update(self):
        return super().update(self.fetch_unemployment)
