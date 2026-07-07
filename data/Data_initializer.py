import time
from datetime import datetime

from data.Global_Macro_Layer.CPI_Fetcher import CPI_Fetcher
from data.Global_Macro_Layer.PCE_Fetcher import PCE_Fetcher
from data.Global_Macro_Layer.GDP_Fetcher import GDP_Fetcher
from data.Global_Macro_Layer.PMI_Fetcher import PMI_Fetcher
from data.Global_Macro_Layer.Unemployment_Fetcher import Unemployment_Fetcher
from data.Global_Macro_Layer.DXY_Fetcher import DXY_Fetcher


# رنگ‌ها برای خروجی حرفه‌ای CLI
class Color:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    RESET = "\033[0m"


def run_fetcher(name, fetcher):
    print(f"{Color.CYAN}⏳ Updating {name}...{Color.RESET}")
    start = time.time()

    try:
        updated = fetcher.update()

        # مقدار آخر را از latest.json بخوانیم
        latest = fetcher.load_latest()

        end = time.time()
        duration = round(end - start, 2)

        if updated:
            print(f"{Color.GREEN}✔ Updated: {name}{Color.RESET}")
        else:
            print(f"{Color.YELLOW}• No new data: {name}{Color.RESET}")

        print(f"   Last Date: {latest['date']}")
        print(f"   Last Value: {latest['value']}")
        print(f"   Time: {duration}s\n")

    except Exception as e:
        print(f"{Color.RED}✖ Error updating {name}: {e}{Color.RESET}\n")


def initialize_us_data():
    print(f"{Color.CYAN}🔄 Fetching US macro data...{Color.RESET}")
    print(f"Started at: {datetime.now()}\n")

    run_fetcher("CPI", CPI_Fetcher("US"))
    run_fetcher("PCE", PCE_Fetcher("US"))
    run_fetcher("GDP", GDP_Fetcher("US"))
    run_fetcher("PMI", PMI_Fetcher("US"))
    run_fetcher("Unemployment", Unemployment_Fetcher("US"))
    run_fetcher("DXY", DXY_Fetcher("US"))

    print(f"{Color.GREEN}✅ All US macro data updated successfully.{Color.RESET}")
    print(f"Finished at: {datetime.now()}")


if __name__ == "__main__":
    initialize_us_data()
