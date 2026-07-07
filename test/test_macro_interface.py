import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from interface.us_macro_interface import USMacroInterface

if __name__ == "__main__":
    data_root = Path("data/US")
    interface = USMacroInterface(data_root=data_root)

    result = interface.run()
    print(result)
