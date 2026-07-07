from data.Global_Macro_Layer.Business_Surveys.US.US_PMI import USPMI
from pathlib import Path

pmi = USPMI(Path("data/US"))

print("Fetching PMI...")

print("MANUFACTURING PMI:", list(pmi.fetch_series("PMI").items())[-5:])
print("SERVICES PMI:", list(pmi.fetch_series("PMIS").items())[-5:])
