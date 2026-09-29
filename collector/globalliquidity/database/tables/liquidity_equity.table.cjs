module.exports = {
    tableName: "liquidity_equity",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        symbol: "TEXT",
        price: "REAL",
        volume: "REAL",
        flow: "REAL"
    }
};
