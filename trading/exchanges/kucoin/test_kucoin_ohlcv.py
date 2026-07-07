import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Testing OHLCV...")

    try:
        candles = await ex.get_ohlcv("BTC-USDT", timeframe="1min", limit=5)
    except Exception as e:
        print("OHLCV Error:", e)
        await ex.close()
        return

    for c in candles:
        print(
            f"{c['timestamp']} | O:{c['open']} H:{c['high']} "
            f"L:{c['low']} C:{c['close']} V:{c['volume']}"
        )

    await ex.close()

asyncio.run(main())
