import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange
from trading.strategy.strategy_engine import StrategyEngine

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    strat = StrategyEngine(ex)

    print("Testing SMA Cross Strategy...")
    result = await strat.sma_cross("BTC-USDT")
    print(result)

    print("\nTesting Full Strategy Execution...")
    exec_result = await strat.execute("BTC-USDT", risk_percent=1)
    print(exec_result)

    await ex.close()

asyncio.run(main())
