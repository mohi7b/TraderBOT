import asyncio
import statistics

class StrategyEngine:

    def __init__(self, exchange):
        self.ex = exchange

    # -------------------------
    # SAFE RESPONSE
    # -------------------------
    def _safe(self, success, message, data=None):
        return {
            "success": success,
            "message": message,
            "data": data
        }

    # -------------------------
    # GET OHLCV
    # -------------------------
    async def get_candles(self, symbol, timeframe="1min", limit=100):
        data = await self.ex.get_ohlcv(symbol, timeframe, limit)

        if not data["success"]:
            return self._safe(False, "Failed to fetch OHLCV", data)

        return self._safe(True, "OHLCV OK", data["data"])

    # -------------------------
    # SIMPLE MOVING AVERAGE
    # -------------------------
    def sma(self, candles, period):
        if len(candles) < period:
            return None

        closes = [c["close"] for c in candles[-period:]]
        return statistics.mean(closes)

    # -------------------------
    # STRATEGY: SMA CROSS
    # -------------------------
    async def sma_cross(self, symbol):
        """
        استراتژی ساده:
        - اگر SMA کوتاه بالای SMA بلند → خرید
        - اگر SMA کوتاه پایین SMA بلند → فروش
        """

        candles = await self.get_candles(symbol, "1min", 100)

        if not candles["success"]:
            return self._safe(False, "Cannot run strategy", candles)

        data = candles["data"]

        sma_short = self.sma(data, 10)
        sma_long = self.sma(data, 30)

        if sma_short is None or sma_long is None:
            return self._safe(False, "Not enough data for SMA")

        if sma_short > sma_long:
            return self._safe(True, "BUY SIGNAL", {
                "sma_short": sma_short,
                "sma_long": sma_long,
                "signal": "BUY"
            })

        if sma_short < sma_long:
            return self._safe(True, "SELL SIGNAL", {
                "sma_short": sma_short,
                "sma_long": sma_long,
                "signal": "SELL"
            })

        return self._safe(True, "NO SIGNAL", {
            "sma_short": sma_short,
            "sma_long": sma_long,
            "signal": "NONE"
        })

    # -------------------------
    # EXECUTE STRATEGY
    # -------------------------
    async def execute(self, symbol, risk_percent=1):
        """
        اجرای کامل استراتژی:
        - گرفتن سیگنال
        - محاسبه حجم معامله
        - اجرای سفارش
        - مدیریت خطا
        """

        signal = await self.sma_cross(symbol)

        if not signal["success"]:
            return self._safe(False, "Strategy failed", signal)

        sig = signal["data"]["signal"]

        # محاسبه حجم معامله
        size_calc = await self.ex.calc_trade_size_by_risk(symbol, risk_percent)

        if not size_calc["success"]:
            return self._safe(False, "Cannot calculate trade size", size_calc)

        size = size_calc["data"]["size"]

        # اجرای سفارش
        if sig == "BUY":
            order = await self.ex.buy_market(symbol, size)
            return self._safe(True, "BUY EXECUTED", {
                "signal": sig,
                "order": order
            })

        if sig == "SELL":
            order = await self.ex.sell_market(symbol, size)
            return self._safe(True, "SELL EXECUTED", {
                "signal": sig,
                "order": order
            })

        return self._safe(True, "NO ACTION", {
            "signal": sig
        })
