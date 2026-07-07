
from config.api_keys import FRED_API_KEY

from .BaseFetcher import BaseFetcher

class GDP_Fetcher(BaseFetcher):
    def __init__(self, country: str):
        super().__init__(country, "gdp")

    def fetch_gdp(self):
        api_key = FRED_API_KEY
        series_id = "GDP"   # Real Gross Domestic Product

        return self.fetch_fred(api_key, series_id)

    def update(self):
        return super().update(self.fetch_gdp)
