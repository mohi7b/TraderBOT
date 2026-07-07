import abc

class ExchangeBase(abc.ABC):
    """
    Base async interface for all exchanges.
    Every exchange (KuCoin, XT, CoinEx, ...) must implement these methods.
    """

    # -------------------------
    # Connection
    # -------------------------
    @abc.abstractmethod
    async def connect(self):
        pass

    # -------------------------
    # Market Data
    # -------------------------
    @abc.abstractmethod
    async def get_price(self, symbol: str):
        pass

    @abc.abstractmethod
    async def get_orderbook(self, symbol: str, depth: int = 20):
        pass

    @abc.abstractmethod
    async def get_ohlcv(self, symbol: str, timeframe: str = "1min", limit: int = 100):
        pass

    # -------------------------
    # Orders
    # -------------------------
    @abc.abstractmethod
    async def buy_market(self, symbol: str, amount: float):
        pass

    @abc.abstractmethod
    async def sell_market(self, symbol: str, amount: float):
        pass

    @abc.abstractmethod
    async def buy_limit(self, symbol: str, amount: float, price: float):
        pass

    @abc.abstractmethod
    async def sell_limit(self, symbol: str, amount: float, price: float):
        pass

    @abc.abstractmethod
    async def cancel_order(self, symbol: str, order_id: str):
        pass

    # -------------------------
    # Account
    # -------------------------
    @abc.abstractmethod
    async def get_balance(self, asset: str = None):
        pass
