import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    print("Placing test order...")
    order = await ex.buy_limit("BTC-USDT", 0.00001, 10000)

    print(order)

    if not order["success"]:
        print("Order failed, stopping test.")
        await ex.close()
        return

    order_id = order["data"]["orderId"]

    print("\nChecking order status...")
    status = await ex.get_order_status(order_id)
    print(status)

    print("\nChecking fill status...")
    filled = await ex.is_order_filled(order_id)
    print(filled)

    print("\nCancelling order...")
    cancel = await ex.cancel_order(order_id)
    print(cancel)

    await ex.close()

asyncio.run(main())
