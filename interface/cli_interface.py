import asyncio
from trading.exchanges.kucoin.kucoin_exchange import KuCoinExchange

async def main():
    ex = KuCoinExchange()
    await ex.connect()

    while True:
        print("\n--- KuCoin Trading Panel ---")
        print("1) Price")
        print("2) Orderbook")
        print("3) Buy Market")
        print("4) Sell Market")
        print("5) Balance")
        print("0) Exit")

        choice = input("Select: ")

        if choice == "1":
            print(await ex.get_price("BTC-USDT"))

        elif choice == "2":
            print(await ex.get_orderbook("BTC-USDT"))

        elif choice == "3":
            amount = float(input("Amount: "))
            print(await ex.buy_market("BTC-USDT", amount))

        elif choice == "4":
            amount = float(input("Amount: "))
            print(await ex.sell_market("BTC-USDT", amount))

        elif choice == "5":
            print(await ex.get_balance())

        elif choice == "0":
            break

asyncio.run(main())
