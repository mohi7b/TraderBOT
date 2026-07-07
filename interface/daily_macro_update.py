from data.Global_Macro_Layer.CPI_Fetcher import CPI_Fetcher
from data.Global_Macro_Layer.PCE_Fetcher import PCE_Fetcher
from data.Global_Macro_Layer.GDP_Fetcher import GDP_Fetcher
from data.Global_Macro_Layer.PMI_Fetcher import PMI_Fetcher
from data.Global_Macro_Layer.Unemployment_Fetcher import Unemployment_Fetcher
from data.Global_Macro_Layer.DXY_Fetcher import DXY_Fetcher

import datetime


def run_daily_update():
    print(f"[{datetime.datetime.utcnow()}] Running daily macro update...")

    CPI_Fetcher("US").update()
    PCE_Fetcher("US").update()
    GDP_Fetcher("US").update()
    PMI_Fetcher("US").update()
    Unemployment_Fetcher("US").update()
    DXY_Fetcher("US").update()

    print("Daily update completed.")


if __name__ == "__main__":
    run_daily_update()
