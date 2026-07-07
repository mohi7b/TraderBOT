import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Testing total balance...")
    total = await ex.get_total_balance()
    print(total)

    print("\nTesting USDT balance...")
    usdt = await ex.get_asset_balance("USDT")
    print(usdt)

    print("\nTesting risk-based trade size...")
    risk = await ex.calc_trade_size_by_risk("BTC-USDT", 1)  # 1% ریسک
    print(risk)

    print("\nTesting USDT-based trade size...")
    size = await ex.calc_trade_size_by_usdt("BTC-USDT", 10)  # 10 USDT
    print(size)

    await ex.close()

asyncio.run(main())
