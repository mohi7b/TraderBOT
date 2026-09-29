module.exports = {
    tableName: "liquidity_commodities",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        symbol: "TEXT",
        price: "REAL",
        inventory: "REAL",
        flow: "REAL"
    }
};
