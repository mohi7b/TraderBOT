import asyncio
import traceback
import time

class BotRunner:

    def __init__(self, exchange, strategy, interval=10):
        self.ex = exchange
        self.strategy = strategy
        self.interval = interval
        self.running = False

    # -------------------------
    # SAFE LOG
    # -------------------------
    def _log(self, msg):
        print(f"[BOT] {msg}")

    # -------------------------
    # SAFE ERROR LOG
    # -------------------------
    def _error(self, e):
        print("[BOT ERROR]", str(e))
        traceback.print_exc()

    # -------------------------
    # RUN ONE CYCLE
    # -------------------------
    async def run_cycle(self, symbol):
        try:
            self._log(f"Running strategy for {symbol}...")

            result = await self.strategy.execute(symbol)

            if not result["success"]:
                self._log(f"Strategy failed: {result['message']}")
                return

            self._log(f"Strategy result: {result['message']}")
            self._log(f"Data: {result['data']}")

        except Exception as e:
            self._error(e)

    # -------------------------
    # MAIN LOOP
    # -------------------------
    async def start(self, symbol):
        self.running = True
        self._log("Bot started")

        while self.running:
            await self.run_cycle(symbol)
            await asyncio.sleep(self.interval)

    # -------------------------
    # STOP BOT
    # -------------------------
    def stop(self):
        self.running = False
        self._log("Bot stopped")
