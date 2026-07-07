"""
Config Loader
-------------
این فایل مسئول لود کردن کانفیگ مخصوص هر کشور است.
با این روش، مدل ماکرو کاملاً ماژولار و قابل توسعه می‌شود.
"""

import importlib

def load_country_config(country_code: str):
    """
    لود کردن فایل کانفیگ مخصوص یک کشور.
    
    ورودی:
        country_code: مثل "US" یا "EU" یا "JP"
    
    خروجی:
        ماژول کانفیگ لود شده
    
    مثال:
        cfg = load_country_config("US")
        print(cfg.MACRO_WEIGHTS)
    """
    module_name = f"config.{country_code}_macro_config"
    return importlib.import_module(module_name)
