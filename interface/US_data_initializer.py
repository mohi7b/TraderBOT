from pathlib import Path

from data.Global_Macro_Layer.Inflation.US.US_CPI import USCPI
from data.Global_Macro_Layer.Inflation.US.US_PCE import USPCE
from data.Global_Macro_Layer.Growth.US.US_GDP import USGDP
from data.Global_Macro_Layer.Business_Surveys.US.US_PMI import USPMI
from data.Global_Macro_Layer.FX.US.US_DXY import USDXY
from data.Global_Macro_Layer.Labor_Market.US.US_Unemployment import USUnemployment


def initialize_us_data():
    print("🔄 Fetching & building US macro data...")

    API_KEY = "3fc297a90f2958fa3b83d6fc67ac7d70"

    OUTPUT_BASE = Path("data/US")
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)

    USCPI(API_KEY, OUTPUT_BASE).update()
    print("Saved: CPI")

    USPCE(API_KEY, OUTPUT_BASE).update()
    print("Saved: PCE")

    USGDP(API_KEY, OUTPUT_BASE).update()
    print("Saved: GDP")

    USDXY(API_KEY, OUTPUT_BASE).update()
    print("Saved: DXY")

    # 🔥 نسخهٔ جدید PMI (بدون API_KEY)
    USPMI(OUTPUT_BASE).update()
    print("Saved: PMI")

    USUnemployment(API_KEY, OUTPUT_BASE).update()
    print("Saved: Unemployment")

    print("✅ All US macro data updated successfully.")


if __name__ == "__main__":
    initialize_us_data()
