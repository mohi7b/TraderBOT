
from config.api_keys import FRED_API_KEY

from .BaseFetcher import BaseFetcher

class DXY_Fetcher(BaseFetcher):
    def __init__(self, country: str = "US"):
        super().__init__(country, "dxy")

    def fetch_dxy(self):
        api_key = FRED_API_KEY
        series_id = "DTWEXBGS"   # Trade Weighted U.S. Dollar Index: Broad

        return self.fetch_fred(api_key, series_id)

    def update(self):
        return super().update(self.fetch_dxy)


