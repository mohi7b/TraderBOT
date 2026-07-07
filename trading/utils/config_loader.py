from trading import BASE_DIR
import json
import os

def load_exchange_keys(exchange_name: str):
    path = os.path.join(BASE_DIR, "config", "exchange_keys.json")
    with open(path) as f:
        keys = json.load(f)
    return keys.get(exchange_name)
