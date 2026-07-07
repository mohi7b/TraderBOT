import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange
from trading.strategy.strategy_engine import StrategyEngine
from trading.bot.bot_runner import BotRunner

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    strat = StrategyEngine(ex)
    bot = BotRunner(ex, strat, interval=10)

    try:
        await bot.start("BTC-USDT")
    except KeyboardInterrupt:
        bot.stop()
        await ex.close()

asyncio.run(main())
