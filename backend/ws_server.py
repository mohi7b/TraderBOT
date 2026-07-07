from fastapi import FastAPI, WebSocket
import uvicorn
import requests
import json
import asyncio
import websockets

app = FastAPI()

async def kucoin_connect():
    r = requests.post(
        "https://api.kucoin.com/api/v1/bullet-public",
        headers={"User-Agent": "Mozilla/5.0"}
    )
    data = r.json()["data"]
    ws_url = data["instanceServers"][0]["endpoint"]
    token = data["token"]

    url = f"{ws_url}?token={token}"
    print("Connecting:", url)

    ws = await websockets.connect(url)
    print("Connected!")

    await ws.send(json.dumps({
        "id": "chart-1",
        "type": "subscribe",
        "topic": "/market/candles:BTC-USDT_1min",
        "privateChannel": False,
        "response": True
    }))

    print("Subscribed.")
    return ws

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    ws = await kucoin_connect()
    candles = []

    while True:
        msg = await ws.recv()
        msg = json.loads(msg)

        if "data" in msg and "candles" in msg["data"]:
            c = msg["data"]["candles"]

            candle = {
                "time": int(c[0]),
                "open": float(c[1]),
                "close": float(c[2]),
                "high": float(c[3]),
                "low": float(c[4])
            }

            candles.append(candle)

            await websocket.send_json({
                "type": "chart",
                "candles": candles[-200:]
            })

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
