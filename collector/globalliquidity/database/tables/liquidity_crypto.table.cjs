module.exports = {
    tableName: "liquidity_crypto",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        symbol: "TEXT",
        price: "REAL",
        marketCap: "REAL",
        exchangeFlow: "REAL"
    }
};
