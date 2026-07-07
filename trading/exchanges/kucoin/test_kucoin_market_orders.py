import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Testing Market Buy...")
    result = await ex.buy_market("BTC-USDT", 0.00001)
    print(result)

    print("Testing Market Sell...")
    result = await ex.sell_market("BTC-USDT", 0.00001)
    print(result)

    await ex.close()

asyncio.run(main())
