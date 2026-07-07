
from config.api_keys import FRED_API_KEY


import requests
from .BaseFetcher import BaseFetcher

class CPI_Fetcher(BaseFetcher):
    def __init__(self, country: str):
        super().__init__(country, "cpi")

    def fetch_cpi(self):
        # سری CPI آمریکا از FRED
        api_key = FRED_API_KEY
        series_id = "CPIAUCSL"

        return self.fetch_fred(api_key, series_id)

    def update(self):
        return super().update(self.fetch_cpi)
