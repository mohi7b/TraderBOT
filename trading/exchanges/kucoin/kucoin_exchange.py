import time
import base64
import hmac
import hashlib
import aiohttp
import json

from trading.core.exchange_base import ExchangeBase
from trading.utils.config_loader import load_exchange_keys


class KuCoinExchange(ExchangeBase):

    # -------------------------
    # SAFE RESPONSE (برای جلوگیری از کرش)
    # -------------------------
    def _safe_response(self, success, message, data=None):
        return {
            "success": success,
            "message": message,
            "data": data
        }

    # -------------------------
    # INIT
    # -------------------------
    def __init__(self):
        keys = load_exchange_keys("kucoin")

        self.api_key = keys["api_key"]
        self.secret_key = keys["secret_key"]
        self.passphrase = keys["passphrase"]

        self.base_url = "https://api.kucoin.com"
        self.session = aiohttp.ClientSession()

    async def connect(self):
        return True

    async def close(self):
        await self.session.close()

    # -------------------------
    # SIGNATURE
    # -------------------------
    async def _headers(self, endpoint, method="GET", body=""):
        now = int(time.time() * 1000)
        str_to_sign = f"{now}{method}{endpoint}{body}"

        signature = base64.b64encode(
            hmac.new(self.secret_key.encode(), str_to_sign.encode(), hashlib.sha256).digest()
        ).decode()

        passphrase = base64.b64encode(
            hmac.new(self.secret_key.encode(), self.passphrase.encode(), hashlib.sha256).digest()
        ).decode()

        return {
            "KC-API-KEY": self.api_key,
            "KC-API-SIGN": signature,
            "KC-API-TIMESTAMP": str(now),
            "KC-API-PASSPHRASE": passphrase,
            "KC-API-KEY-VERSION": "2",
            "Content-Type": "application/json"
        }

    # -------------------------
    # GET / POST
    # -------------------------
    async def _get(self, endpoint):
        try:
            async with self.session.get(self.base_url + endpoint) as resp:
                return await resp.json()
        except Exception as e:
            return {"error": str(e)}

    async def _post(self, endpoint, body):
        try:
            body_json = json.dumps(body)
            headers = await self._headers(endpoint, "POST", body_json)
            async with self.session.post(self.base_url + endpoint, headers=headers, data=body_json) as resp:
                return await resp.json()
        except Exception as e:
            return {"error": str(e)}

    # -------------------------
    # PRICE
    # -------------------------
    async def get_price(self, symbol):
        data = await self._get(f"/api/v1/market/orderbook/level1?symbol={symbol}")
        try:
            return float(data["data"]["price"])
        except:
            return None

    # -------------------------
    # ORDERBOOK
    # -------------------------
    async def get_orderbook(self, symbol, depth=20):
        endpoint = f"/api/v1/market/orderbook/level2_20?symbol={symbol}"
        data = await self._get(endpoint)

        if "data" not in data or data["data"] is None:
            return self._safe_response(False, "KuCoin returned no data for orderbook")

        ob = data["data"]

        bids = ob.get("bids", [])[:depth]
        asks = ob.get("asks", [])[:depth]

        if not bids or not asks:
            return self._safe_response(False, "OrderBook is empty or malformed")

        return self._safe_response(True, "OrderBook OK", {
            "bids": [{"price": float(p), "size": float(s)} for p, s in bids],
            "asks": [{"price": float(p), "size": float(s)} for p, s in asks],
            "timestamp": ob.get("time", None)
        })

    # -------------------------
    # BALANCE
    # -------------------------
    async def get_balance(self, asset=None):
        data = await self._get("/api/v1/accounts")

        if "data" not in data:
            return []

        if asset is None:
            return data["data"]

        return [x for x in data["data"] if x["currency"] == asset]

    # -------------------------
    # MARKET BUY / SELL (با مدیریت خطا + چک موجودی)
    # -------------------------
    async def buy_market(self, symbol, size):
        try:
            base_asset = symbol.split("-")[0]
            balance = await self.get_balance(base_asset)

            if not balance or float(balance[0]["available"]) < size:
                return self._safe_response(False, f"Insufficient balance to buy {size} {base_asset}")

            body = {
                "tradeType": "SPOT",
                "symbol": symbol,
                "clientOid": str(int(time.time() * 1000)),
                "side": "BUY",
                "orderType": "MARKET",
                "size": str(size),
                "sizeUnit": "BASECCY"
            }

            result = await self._post("/api/ua/v1/unified/order/place", body)

            if result.get("code") != "200000":
                return self._safe_response(False, f"KuCoin Error: {result}", result)

            return self._safe_response(True, "Market Buy Executed", result)

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")

    async def sell_market(self, symbol, size):
        try:
            base_asset = symbol.split("-")[0]
            balance = await self.get_balance(base_asset)

            if not balance or float(balance[0]["available"]) < size:
                return self._safe_response(False, f"Insufficient balance to sell {size} {base_asset}")

            body = {
                "tradeType": "SPOT",
                "symbol": symbol,
                "clientOid": str(int(time.time() * 1000)),
                "side": "SELL",
                "orderType": "MARKET",
                "size": str(size),
                "sizeUnit": "BASECCY"
            }

            result = await self._post("/api/ua/v1/unified/order/place", body)

            if result.get("code") != "200000":
                return self._safe_response(False, f"KuCoin Error: {result}", result)

            return self._safe_response(True, "Market Sell Executed", result)

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")

    # -------------------------
    # LIMIT ORDERS
    # -------------------------
    async def buy_limit(self, symbol, size, price):
        body = {
            "tradeType": "SPOT",
            "symbol": symbol,
            "clientOid": str(int(time.time() * 1000)),
            "side": "BUY",
            "orderType": "LIMIT",
            "price": str(price),
            "size": str(size),
            "sizeUnit": "BASECCY",
            "timeInForce": "GTC"
        }
        return await self._post("/api/ua/v1/unified/order/place", body)

    async def sell_limit(self, symbol, size, price):
        body = {
            "tradeType": "SPOT",
            "symbol": symbol,
            "clientOid": str(int(time.time() * 1000)),
            "side": "SELL",
            "orderType": "LIMIT",
            "price": str(price),
            "size": str(size),
            "sizeUnit": "BASECCY",
            "timeInForce": "GTC"
        }
        return await self._post("/api/ua/v1/unified/order/place", body)

    # -------------------------
    # CANCEL ORDER
    # -------------------------
    async def cancel_order(self, symbol, order_id):
        return await self._post(f"/api/v1/orders/{order_id}/cancel", {})
    

    # -------------------------
    # ORDER MANAGER
    # -------------------------

    async def get_order(self, order_id):
        """
        گرفتن اطلاعات کامل سفارش
        """
        try:
            endpoint = f"/api/v1/orders/{order_id}"
            data = await self._get(endpoint)

            if "data" not in data:
                return self._safe_response(False, "KuCoin returned no order data")

            return self._safe_response(True, "Order data OK", data["data"])

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def get_order_status(self, order_id):
        """
        بررسی وضعیت سفارش (Filled / Open / Cancelled)
        """
        try:
            endpoint = f"/api/v1/orders/{order_id}"
            data = await self._get(endpoint)

            if "data" not in data:
                return self._safe_response(False, "KuCoin returned no order status")

            status = data["data"]["status"]  # active, done, cancel

            return self._safe_response(True, "Order status OK", {
                "orderId": order_id,
                "status": status
            })

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def is_order_filled(self, order_id):
        """
        بررسی اینکه سفارش کاملاً پر شده یا نه
        """
        try:
            endpoint = f"/api/v1/orders/{order_id}"
            data = await self._get(endpoint)

            if "data" not in data:
                return self._safe_response(False, "KuCoin returned no order data")

            filled = float(data["data"]["dealSize"])
            size = float(data["data"]["size"])

            return self._safe_response(True, "Order fill check OK", {
                "orderId": order_id,
                "filled": filled,
                "size": size,
                "isFilled": filled >= size
            })

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def cancel_order(self, order_id):
        """
        لغو سفارش با مدیریت خطا
        """
        try:
            endpoint = f"/api/v1/orders/{order_id}/cancel"
            data = await self._post(endpoint, {})

            if data.get("code") != "200000":
                return self._safe_response(False, f"KuCoin Error: {data}", data)

            return self._safe_response(True, "Order cancelled", data)

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")



    # -------------------------
    # BALANCE MANAGER
    # -------------------------

    async def get_total_balance(self):
        """
        گرفتن کل موجودی‌ها (Spot / Trading / Main)
        """
        try:
            data = await self._get("/api/v1/accounts")

            if "data" not in data:
                return self._safe_response(False, "KuCoin returned no balance data")

            return self._safe_response(True, "Balance OK", data["data"])

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def get_asset_balance(self, asset):
        """
        گرفتن موجودی یک ارز خاص (مثلاً BTC یا USDT)
        """
        try:
            data = await self._get("/api/v1/accounts")

            if "data" not in data:
                return self._safe_response(False, "KuCoin returned no balance data")

            filtered = [x for x in data["data"] if x["currency"] == asset]

            if not filtered:
                return self._safe_response(False, f"No balance found for {asset}")

            return self._safe_response(True, "Asset balance OK", filtered[0])

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def calc_trade_size_by_risk(self, symbol, risk_percent):
        """
        محاسبه حجم معامله بر اساس درصد ریسک
        مثال: risk_percent = 1 یعنی 1٪ موجودی USDT
        """
        try:
            quote = symbol.split("-")[1]  # USDT
            bal = await self.get_asset_balance(quote)

            if not bal["success"]:
                return bal

            available = float(bal["data"]["available"])

            risk_amount = available * (risk_percent / 100)

            price = await self.get_price(symbol)
            if price is None:
                return self._safe_response(False, "Cannot fetch price")

            size = risk_amount / price

            return self._safe_response(True, "Trade size calculated", {
                "risk_percent": risk_percent,
                "risk_amount": risk_amount,
                "price": price,
                "size": size
            })

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    async def calc_trade_size_by_usdt(self, symbol, usdt_amount):
        """
        محاسبه حجم معامله بر اساس مقدار USDT
        """
        try:
            price = await self.get_price(symbol)
            if price is None:
                return self._safe_response(False, "Cannot fetch price")

            size = usdt_amount / price

            return self._safe_response(True, "Trade size calculated", {
                "usdt_amount": usdt_amount,
                "price": price,
                "size": size
            })

        except Exception as e:
            return self._safe_response(False, f"Exception: {str(e)}")


    # -------------------------
    # OHLCV
    # -------------------------
    async def get_ohlcv(self, symbol, timeframe="1min", limit=100):
        endpoint = f"/api/v1/market/candles?symbol={symbol}&type={timeframe}"
        data = await self._get(endpoint)

        if "data" not in data or data["data"] is None:
            return self._safe_response(False, "KuCoin returned no OHLCV data")

        raw = data["data"][:limit]

        ohlcv = []
        for c in raw:
            ts, open_, close_, high, low, volume, turnover = c
            ohlcv.append({
                "timestamp": int(ts),
                "open": float(open_),
                "high": float(high),
                "low": float(low),
                "close": float(close_),
                "volume": float(volume)
            })

        return self._safe_response(True, "OHLCV OK", ohlcv)
