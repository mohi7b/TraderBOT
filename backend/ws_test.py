import asyncio
import websockets
import json
import requests

async def test():
    r = requests.post("https://api.kucoin.com/api/v1/bullet-public")
    data = r.json()["data"]
    ws_url = data["instanceServers"][0]["endpoint"]
    token = data["token"]

    url = f"{ws_url}?token={token}"
    print("Connecting:", url)

    ws = await websockets.connect(url)
    print("Connected!")

    await ws.send(json.dumps({
        "id": "test",
        "type": "subscribe",
        "topic": "/market/candles:BTC-USDT_1min",
        "privateChannel": False,
        "response": True
    }))

    print("Subscribed. Waiting...")

    while True:
        msg = await ws.recv()
        print(msg)

asyncio.run(test())
