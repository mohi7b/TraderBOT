import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Testing price...")
    price = await ex.get_price("BTC-USDT")
    print("BTC Price:", price)

asyncio.run(main())
