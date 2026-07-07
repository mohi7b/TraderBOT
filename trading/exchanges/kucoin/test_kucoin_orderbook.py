import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Testing OrderBook...")

    try:
        ob = await ex.get_orderbook("BTC-USDT", depth=10)
    except Exception as e:
        print("OrderBook Error:", e)
        await ex.close()
        return

    print("\nTop 10 Bids:")
    for b in ob["bids"]:
        print(f"Bid: {b['price']}  Size: {b['size']}")

    print("\nTop 10 Asks:")
    for a in ob["asks"]:
        print(f"Ask: {a['price']}  Size: {a['size']}")

    await ex.close()

asyncio.run(main())
